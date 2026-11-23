import { z } from 'zod';
import { db } from './db';
import { HttpError } from './api';
import { lockStore, orderInclude, nextOrderCode, vietnamDay } from './sales';
import { paymentSchema } from './sales-validation';
import { changeDue } from './money';
import { auditDiscount } from './discount-audit';
export function equalShares(total: number, count: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 20 ||
    total < count
  )
    throw new HttpError('Chọn 2–20 người, mỗi phần ít nhất 1 ₫.');
  return Array.from(
    { length: count },
    (_, i) => Math.floor(total / count) + (i === 0 ? total % count : 0),
  );
}
export const shareSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  count: z.number().int().min(2).max(20),
});
type Actor = { id: string; storeId: string };
export async function startShares(
  actor: Actor,
  id: string,
  input: z.infer<typeof shareSchema>,
) {
  return db.$transaction(async (tx) => {
    await lockStore(tx, actor.storeId);
    if (
      !(await tx.user.findFirst({
        where: { id: actor.id, storeId: actor.storeId, isActive: true },
      }))
    )
      throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
    const order = await tx.order.findFirst({
      where: { id, storeId: actor.storeId },
      include: orderInclude,
    });
    if (!order) throw new HttpError('Không tìm thấy đơn', 404);
    if (order.splitId === input.id && order.paymentParts.length === input.count)
      return order;
    if (
      order.status !== 'OPEN' ||
      order.version !== input.version ||
      order.paymentParts.length ||
      order.payments.length
    )
      throw new HttpError(
        'Đơn đã thay đổi hoặc đã chia đều. Mở lại đơn để kiểm tra.',
        409,
      );
    if (
      !(await tx.shift.findFirst({
        where: { id: order.shiftId, storeId: actor.storeId, closedAt: null },
      }))
    )
      throw new HttpError('Ca đã đóng', 409);
    const amounts = equalShares(order.total, input.count);
    await tx.order.update({
      where: { id },
      data: { splitId: input.id, version: { increment: 1 } },
    });
    for (const [position, amount] of amounts.entries())
      await tx.paymentPart.create({
        data: {
          storeId: actor.storeId,
          orderId: id,
          position: position + 1,
          amount,
        },
      });
    await tx.auditLog.create({
      data: {
        storeId: actor.storeId,
        userId: actor.id,
        action: 'SHARE',
        entity: 'orders',
        entityId: id,
        data: { count: input.count, total: order.total },
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
}
export async function payShare(
  actor: Actor,
  id: string,
  partId: string,
  input: z.infer<typeof paymentSchema>,
) {
  if (!input.id) throw new HttpError('Thiếu mã thanh toán của phần');
  return db.$transaction(async (tx) => {
    await lockStore(tx, actor.storeId);
    if (
      !(await tx.user.findFirst({
        where: { id: actor.id, storeId: actor.storeId, isActive: true },
      }))
    )
      throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
    const order = await tx.order.findFirst({
      where: { id, storeId: actor.storeId },
      include: orderInclude,
    });
    const part = order?.paymentParts.find((p) => p.id === partId);
    if (!order || !part)
      throw new HttpError('Không tìm thấy phần thanh toán', 404);
    if (part.payment) {
      if (
        part.payment.id === input.id &&
        part.payment.method === input.method &&
        part.payment.confirmedBy === actor.id &&
        part.payment.received ===
          (input.method === 'CASH' ? input.received : null)
      )
        return order;
      throw new HttpError(
        'Phần này đã được thanh toán. Không thu thêm tiền.',
        409,
        { order },
      );
    }
    if (order.status !== 'OPEN') throw new HttpError('Đơn không còn mở', 409);
    if (
      !(await tx.shift.findFirst({
        where: { id: order.shiftId, storeId: actor.storeId, closedAt: null },
      }))
    )
      throw new HttpError('Ca đã đóng', 409);
    const change =
      input.method === 'CASH' ? changeDue(part.amount, input.received) : null;
    await tx.payment.create({
      data: {
        id: input.id,
        storeId: actor.storeId,
        orderId: id,
        shiftId: order.shiftId,
        partId,
        amount: part.amount,
        method: input.method,
        received: input.method === 'CASH' ? input.received : null,
        change,
        confirmedBy: actor.id,
      },
    });
    const complete = order.paymentParts.every(
      (p) => p.id === partId || p.payment,
    );
    const paidAt = new Date(),
      numbering =
        complete && order.businessDate !== vietnamDay(paidAt)
          ? await nextOrderCode(tx, actor.storeId, paidAt)
          : undefined;
    await tx.order.update({
      where: { id },
      data: {
        version: { increment: 1 },
        ...(complete ? { status: 'PAID', paidAt, ...numbering } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        storeId: actor.storeId,
        userId: actor.id,
        action: 'PAY',
        entity: 'orders',
        entityId: id,
        data: {
          amount: part.amount,
          method: input.method,
          part: part.position,
          ...(numbering
            ? { previousCode: order.code, code: numbering.code }
            : {}),
        },
      },
    });
    if (complete) await auditDiscount(tx, actor, order);
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
}
