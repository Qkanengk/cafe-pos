import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import {
  cartTotal,
  changeDue,
  expectedCash,
  shiftDifference,
  paymentTotals,
} from './money';
import { checkoutSchema, paymentSchema } from './sales-validation';
import { HttpError } from './api';

export const orderInclude = {
  items: { include: { toppings: true }, orderBy: { id: 'asc' } },
  payments: true,
  creator: { select: { name: true } },
  table: { select: { name: true, area: true } },
} satisfies Prisma.OrderInclude;
export const shiftInclude = {
  opener: { select: { name: true } },
  closer: { select: { name: true } },
  orders: {
    select: {
      status: true,
      payments: {
        select: { method: true, amount: true, received: true, change: true },
      },
    },
  },
} satisfies Prisma.ShiftInclude;
type ShiftData = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>;
export function summarizeShift(shift: ShiftData) {
  const totals = paymentTotals(
    shift.orders.filter((o) => o.status === 'PAID').flatMap((o) => o.payments),
  );
  const expected = expectedCash(
    shift.openingCash,
    shift.orders.filter((o) => o.status === 'PAID').flatMap((o) => o.payments),
  );
  const { orders, ...data } = shift;
  return {
    ...data,
    expectedCash: expected,
    difference:
      shift.countedCash === null
        ? null
        : shiftDifference(expected, shift.countedCash),
    cashSales: totals.cash,
    bankSales: totals.bank,
    paidCount: orders.filter((o) => o.status === 'PAID').length,
    openCount: orders.filter((o) => o.status === 'OPEN').length,
  };
}
export async function listShifts(storeId: string) {
  return (
    await db.shift.findMany({
      where: { storeId },
      include: shiftInclude,
      orderBy: { openedAt: 'desc' },
      take: 50,
    })
  ).map(summarizeShift);
}
export function vietnamDay(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export async function lockStore(tx: Prisma.TransactionClient, storeId: string) {
  await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
}
export async function nextOrderCode(
  tx: Prisma.TransactionClient,
  storeId: string,
  date = new Date(),
) {
  const businessDate = vietnamDay(date);
  const sequence = await tx.order.aggregate({
    where: { storeId, businessDate },
    _max: { dailyNumber: true },
  });
  const dailyNumber = (sequence._max.dailyNumber ?? 0) + 1;
  return {
    businessDate,
    dailyNumber,
    code:
      'CF' +
      businessDate.replaceAll('-', '') +
      '-' +
      String(dailyNumber).padStart(4, '0'),
  };
}
type Actor = { id: string; storeId: string };
async function liveActor(tx: Prisma.TransactionClient, actor: Actor) {
  if (
    !(await tx.user.findFirst({
      where: { id: actor.id, storeId: actor.storeId, isActive: true },
    }))
  )
    throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
}
export async function prepareOrder(
  actor: Actor,
  input: z.infer<typeof checkoutSchema>,
) {
  const requestHash = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
  return db.$transaction(async (tx) => {
    await lockStore(tx, actor.storeId);
    await liveActor(tx, actor);
    const existing = await tx.order.findUnique({
      where: { id: input.id },
      include: orderInclude,
    });
    if (existing) {
      if (existing.storeId !== actor.storeId || existing.createdBy !== actor.id)
        throw new HttpError('Mã đơn không hợp lệ', 409);
      if (existing.requestHash !== requestHash)
        throw new HttpError(
          'Mã đơn đã dùng với nội dung khác. Vui lòng mở lại đơn đã chốt.',
          409,
        );
      return existing;
    }
    const shift = await tx.shift.findFirst({
      where: { storeId: actor.storeId, closedAt: null },
    });
    if (!shift) throw new HttpError('Vui lòng mở ca trước khi bán hàng', 409);
    if (input.lines.some((line) => line.itemId))
      throw new HttpError('Món đã lưu phải sửa tại đơn gốc');
    if (
      input.type === 'DINE_IN' &&
      (await tx.order.findFirst({
        where: {
          storeId: actor.storeId,
          tableId: input.tableId,
          status: 'OPEN',
        },
      }))
    )
      throw new HttpError(
        'Bàn đang phục vụ. Vui lòng tải lại và mở đơn của bàn.',
        409,
      );
    if (
      input.type === 'DINE_IN' &&
      !(await tx.table.findFirst({
        where: { id: input.tableId, storeId: actor.storeId },
      }))
    )
      throw new HttpError('Bàn không tồn tại', 400);
    const variants = await tx.productVariant.findMany({
      where: {
        storeId: actor.storeId,
        isActive: true,
        id: { in: input.lines.map((l) => l.variantId) },
      },
      include: { product: true },
    });
    const toppings = await tx.topping.findMany({
      where: {
        storeId: actor.storeId,
        id: { in: input.lines.flatMap((l) => l.toppingIds) },
      },
    });
    const lines = input.lines.map((line) => {
      const variant = variants.find((v) => v.id === line.variantId);
      if (!variant || !variant.product.isAvailable)
        throw new HttpError('Một món đã hết hàng hoặc không còn tồn tại', 409);
      const selected = line.toppingIds.map((id) => {
        const topping = toppings.find((t) => t.id === id);
        if (!topping?.isAvailable)
          throw new HttpError(
            'Một topping đã hết hàng hoặc không còn tồn tại',
            409,
          );
        return topping;
      });
      return { variant, selected, line };
    });
    const totals = cartTotal(
      lines.map(({ variant, selected, line }) => ({
        price: variant.price,
        quantity: line.quantity,
        toppings: selected.map((t) => t.price),
      })),
      input.discount,
    );
    if (totals.total > 2147483647 || totals.subtotal > 2147483647)
      throw new HttpError('Giá trị đơn vượt giới hạn');
    const { businessDate, dailyNumber, code } = await nextOrderCode(
      tx,
      actor.storeId,
    );
    const order = await tx.order.create({
      data: {
        id: input.id,
        storeId: actor.storeId,
        shiftId: shift.id,
        createdBy: actor.id,
        type: input.type,
        tableId: input.type === 'DINE_IN' ? input.tableId : null,
        subtotal: totals.subtotal,
        total: totals.total,
        discountType: input.discount?.type,
        discountValue: input.discount?.value ?? 0,
        note: input.note,
        businessDate,
        dailyNumber,
        code,
        requestHash,
      },
    });
    for (const { variant, selected, line } of lines) {
      const item = await tx.orderItem.create({
        data: {
          storeId: actor.storeId,
          orderId: order.id,
          productId: variant.productId,
          variantId: variant.id,
          nameSnapshot: variant.product.name + ' · ' + variant.name,
          priceSnapshot: variant.price,
          quantity: line.quantity,
          note: line.note,
        },
      });
      if (selected.length)
        await tx.orderItemTopping.createMany({
          data: selected.map((t) => ({
            storeId: actor.storeId,
            orderItemId: item.id,
            toppingId: t.id,
            nameSnapshot: t.name,
            priceSnapshot: t.price,
          })),
        });
    }
    await tx.auditLog.create({
      data: {
        storeId: actor.storeId,
        userId: actor.id,
        entity: 'orders',
        entityId: order.id,
        action: 'HOLD',
        data: { version: 1 },
      },
    });
    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderInclude,
    });
  });
}
export async function payOrder(
  actor: Actor,
  id: string,
  payment: z.infer<typeof paymentSchema>,
) {
  return db.$transaction(async (tx) => {
    await lockStore(tx, actor.storeId);
    await liveActor(tx, actor);
    const order = await tx.order.findFirst({
      where: { id, storeId: actor.storeId },
      include: orderInclude,
    });
    if (!order) throw new HttpError('Không tìm thấy đơn', 404);
    if (order.status === 'PAID') {
      const prior = order.payments.find((p) => p.id === payment.id);
      if (
        payment.id &&
        prior &&
        prior.confirmedBy === actor.id &&
        prior.method === payment.method &&
        prior.received === (payment.method === 'CASH' ? payment.received : null)
      )
        return order;
      throw new HttpError(
        'Đơn đã được thanh toán. Không nhận thêm tiền hoặc trả tiền thừa dự kiến; hãy kiểm tra hóa đơn đã thu.',
        409,
        { order },
      );
    }
    if ((payment.version ?? 1) !== order.version)
      throw new HttpError(
        'Đơn đã được thay đổi trên thiết bị khác. Vui lòng tải lại đơn.',
        409,
      );
    if (order.status !== 'OPEN')
      throw new HttpError('Đơn không thể thanh toán', 409);
    const shift = await tx.shift.findFirst({
      where: { id: order.shiftId, storeId: actor.storeId, closedAt: null },
    });
    if (!shift) throw new HttpError('Ca đã đóng. Không thể thanh toán', 409);
    const change =
      payment.method === 'CASH'
        ? changeDue(order.total, payment.received)
        : null;
    await tx.payment.create({
      data: {
        ...(payment.id ? { id: payment.id } : {}),
        storeId: actor.storeId,
        orderId: id,
        method: payment.method,
        amount: order.total,
        received: payment.method === 'CASH' ? payment.received : null,
        change,
        confirmedBy: actor.id,
      },
    });
    await tx.order.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        storeId: actor.storeId,
        userId: actor.id,
        action: 'PAY',
        entity: 'orders',
        entityId: id,
        data: {
          method: payment.method,
          amount: order.total,
          confirmedBy: actor.id,
        },
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
}
