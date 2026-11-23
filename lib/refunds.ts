import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { HttpError } from './api';
import { approveOwner } from './owner-approval';
import { planRefund } from './refund-amount';
import { lockStore, orderInclude } from './sales';
import { sumMoney } from './money';
export const refundSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  amount: z.number().int().positive().max(2147483647),
  ownerPin: z.string().regex(/^\d{4,6}$/, 'PIN gồm 4–6 chữ số'),
  reason: z.string().trim().min(1, 'Nhập lý do hoàn tiền').max(300),
  method: z.enum(['CASH', 'BANK_TRANSFER']),
  items: z
    .array(
      z.object({ itemId: z.uuid(), quantity: z.number().int().positive() }),
    )
    .min(1)
    .max(100)
    .optional(),
});
export async function refundOrder(
  actor: { id: string; storeId: string; ip?: string },
  id: string,
  input: z.infer<typeof refundSchema>,
) {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        id,
        version: input.version,
        amount: input.amount,
        reason: input.reason,
        method: input.method,
        items: input.items?.toSorted((a, b) =>
          a.itemId.localeCompare(b.itemId),
        ),
      }),
    )
    .digest('hex');
  return db.$transaction(async (tx) => {
    await lockStore(tx, actor.storeId);
    if (
      !(await tx.user.findFirst({
        where: { id: actor.id, storeId: actor.storeId, isActive: true },
      }))
    )
      throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
    const ownerId = await approveOwner(tx, actor, input.ownerPin);
    const order = await tx.order.findFirst({
      where: { id, storeId: actor.storeId },
      include: orderInclude,
    });
    if (!order) throw new HttpError('Không tìm thấy đơn', 404);
    const previous = await tx.refund.findFirst({
      where: { id: input.id, storeId: actor.storeId },
    });
    if (previous) {
      if (previous.orderId === id && previous.requestHash === hash)
        return order;
      throw new HttpError('Mã hoàn tiền đã dùng với nội dung khác', 409);
    }
    if (order.status !== 'PAID')
      throw new HttpError('Chỉ hoàn tiền cho đơn đã thanh toán', 409);
    const stale =
      'Hóa đơn đã thay đổi. Chưa ghi khoản hoàn này; không trả thêm tiền. Đối chiếu lại số tiền và nhập lại PIN chủ quán để xác nhận lại.';
    if (order.version !== input.version)
      throw new HttpError(stale, 409, { order });
    const shift = await tx.shift.findFirst({
      where: { storeId: actor.storeId, closedAt: null },
    });
    if (!shift)
      throw new HttpError(
        'Mở ca trước khi hoàn tiền. Tiền hoàn được ghi vào ca hiện tại.',
        409,
      );
    let lines: ReturnType<typeof planRefund>;
    try {
      lines = planRefund(order, input.items);
    } catch (e) {
      throw new HttpError(
        e instanceof Error ? e.message : 'Số lượng hoàn không hợp lệ',
        409,
      );
    }
    const amount = sumMoney(lines.map((i) => i.amount));
    if (amount !== input.amount) throw new HttpError(stale, 409, { order });
    if (
      amount <= 0 ||
      amount + sumMoney(order.refunds.map((r) => r.amount)) > order.total
    )
      throw new HttpError('Đơn không còn số tiền có thể hoàn', 409);
    await tx.refund.create({
      data: {
        id: input.id,
        storeId: actor.storeId,
        orderId: id,
        shiftId: shift.id,
        ownerId,
        reason: input.reason,
        amount,
        requestHash: hash,
        items: {
          create: lines,
        },
      },
    });
    await tx.payment.create({
      data: {
        storeId: actor.storeId,
        orderId: id,
        shiftId: shift.id,
        refundId: input.id,
        method: input.method,
        amount: -amount,
        confirmedBy: actor.id,
      },
    });
    await tx.order.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        storeId: actor.storeId,
        userId: actor.id,
        action: 'REFUND',
        entity: 'orders',
        entityId: id,
        data: {
          reason: input.reason,
          amount,
          method: input.method,
          ownerId,
          items: lines,
        },
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
}
