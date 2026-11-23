import { compare } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { HttpError } from './api';
import { pinLimiter, pinLockMessage } from './pin-limit';
import { lockStore, nextOrderCode, orderInclude } from './sales';
import { editOrderSchema, operationSchema } from './sales-validation';
import { cartTotal, discountAmount, allocateDiscount, sumMoney } from './money';

type Tx = Prisma.TransactionClient;
type Actor = { id: string; storeId: string; ip?: string };
type Order = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export const conflict =
  'Đơn đã được thay đổi trên thiết bị khác. Vui lòng tải lại đơn.';
export function checkVersion(actual: number, expected: number) {
  if (actual !== expected) throw new HttpError(conflict, 409);
}
async function activeOrder(
  tx: Tx,
  actor: Actor,
  id: string,
  version: number,
  replayHash?: string,
) {
  const order = await tx.order.findFirst({
    where: { id, storeId: actor.storeId },
    include: orderInclude,
  });
  if (!order) throw new HttpError('Không tìm thấy đơn', 404);
  if (
    replayHash &&
    order.status === 'OPEN' &&
    order.version === version + 1 &&
    order.requestHash === replayHash
  )
    return order;
  checkVersion(order.version, version);
  if (order.status !== 'OPEN')
    throw new HttpError('Chỉ được sửa đơn đang mở', 409);
  if (
    !(await tx.shift.findFirst({
      where: { id: order.shiftId, storeId: actor.storeId, closedAt: null },
    }))
  )
    throw new HttpError('Ca đã đóng', 409);
  return order;
}
async function authorizeActor(tx: Tx, actor: Actor) {
  await lockStore(tx, actor.storeId);
  if (
    !(await tx.user.findFirst({
      where: { id: actor.id, storeId: actor.storeId, isActive: true },
    }))
  )
    throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
}
async function audit(
  tx: Tx,
  actor: Actor,
  id: string,
  action: string,
  data: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      storeId: actor.storeId,
      userId: actor.id,
      entity: 'orders',
      entityId: id,
      action,
      data,
    },
  });
}
function priced(items: Order['items']) {
  return items.map((i) => ({
    price: i.priceSnapshot,
    quantity: i.quantity,
    status: i.status,
    toppings: i.toppings.map((t) => t.priceSnapshot),
  }));
}
async function recompute(
  tx: Tx,
  id: string,
  override?: { type: 'AMOUNT'; value: number },
  requestHash?: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id },
    include: orderInclude,
  });
  const discount =
    override ??
    (order.discountType
      ? { type: order.discountType, value: order.discountValue }
      : undefined);
  const money = cartTotal(priced(order.items), discount);
  if (money.subtotal > 2147483647)
    throw new HttpError('Giá trị đơn vượt giới hạn');
  return tx.order.update({
    where: { id },
    data: {
      subtotal: money.subtotal,
      total: money.total,
      version: { increment: 1 },
      requestHash: requestHash ?? null,
      ...(override
        ? { discountType: override.type, discountValue: override.value }
        : {}),
    },
    include: orderInclude,
  });
}
async function checkTable(
  tx: Tx,
  actor: Actor,
  tableId: string,
  excludeId: string,
) {
  if (
    !(await tx.table.findFirst({
      where: { id: tableId, storeId: actor.storeId },
    }))
  )
    throw new HttpError('Bàn không tồn tại', 404);
  if (
    await tx.order.findFirst({
      where: {
        storeId: actor.storeId,
        tableId,
        status: 'OPEN',
        id: { not: excludeId },
      },
    })
  )
    throw new HttpError('Bàn đích đang phục vụ. Hãy dùng gộp đơn.', 409);
}
export async function editOrder(
  actor: Actor,
  id: string,
  input: z.infer<typeof editOrderSchema>,
) {
  return db.$transaction(async (tx) => {
    await authorizeActor(tx, actor);
    const requestHash = createHash('sha256')
      .update('edit:' + actor.id + ':' + JSON.stringify(input))
      .digest('hex');
    const order = await activeOrder(tx, actor, id, input.version, requestHash);
    if (order.version !== input.version) return order;
    const body = input.order;
    if (body.id !== id) throw new HttpError('Mã đơn không hợp lệ');
    if (body.type === 'DINE_IN' && body.tableId !== order.tableId)
      await checkTable(tx, actor, body.tableId!, id);
    const ids = body.lines.flatMap((l) => (l.itemId ? [l.itemId] : []));
    if (new Set(ids).size !== ids.length) throw new HttpError('Món bị lặp');
    const active = order.items.filter((i) => i.status === 'ACTIVE');
    if (active.some((i) => !ids.includes(i.id)))
      throw new HttpError('Hủy món cần PIN chủ quán và lý do');
    for (const line of body.lines) {
      if (line.itemId) {
        const item = active.find((i) => i.id === line.itemId);
        if (!item) throw new HttpError('Món không thuộc đơn', 409);
        if (
          line.variantId !== item.variantId ||
          line.quantity < item.quantity ||
          JSON.stringify([...line.toppingIds].sort()) !==
            JSON.stringify(item.toppings.map((t) => t.toppingId).sort())
        )
          throw new HttpError(
            'Giảm số lượng hoặc đổi món/topping đã lưu cần hủy món bằng PIN chủ quán',
          );
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: line.quantity, note: line.note },
        });
      } else {
        const variant = await tx.productVariant.findFirst({
          where: { id: line.variantId, storeId: actor.storeId, isActive: true },
          include: {
            product: { include: { toppings: { select: { id: true } } } },
          },
        });
        if (!variant?.product.isAvailable)
          throw new HttpError('Món đã hết hàng', 409);
        if (
          line.toppingIds.some(
            (id) => !variant.product.toppings.some((t) => t.id === id),
          )
        )
          throw new HttpError('Topping không dùng cho món này', 400);
        const toppings = await tx.topping.findMany({
          where: {
            id: { in: line.toppingIds },
            storeId: actor.storeId,
            isAvailable: true,
          },
        });
        if (toppings.length !== line.toppingIds.length)
          throw new HttpError('Topping đã hết hàng', 409);
        const item = await tx.orderItem.create({
          data: {
            storeId: actor.storeId,
            orderId: id,
            productId: variant.productId,
            variantId: variant.id,
            nameSnapshot: variant.product.name + ' · ' + variant.name,
            priceSnapshot: variant.price,
            quantity: line.quantity,
            note: line.note,
          },
        });
        if (toppings.length)
          await tx.orderItemTopping.createMany({
            data: toppings.map((t) => ({
              storeId: actor.storeId,
              orderItemId: item.id,
              toppingId: t.id,
              nameSnapshot: t.name,
              priceSnapshot: t.price,
            })),
          });
      }
    }
    await tx.order.update({
      where: { id },
      data: {
        type: body.type,
        tableId: body.type === 'DINE_IN' ? body.tableId : null,
        discountType: body.discount?.type ?? null,
        discountValue: body.discount?.value ?? 0,
        note: body.note,
      },
    });
    const updated = await recompute(tx, id, undefined, requestHash);
    await audit(tx, actor, id, 'HOLD', {
      previousVersion: order.version,
      version: updated.version,
    });
    return updated;
  });
}
export async function operateOrder(
  actor: Actor,
  id: string,
  input: z.infer<typeof operationSchema>,
) {
  return db.$transaction(async (tx) => {
    await authorizeActor(tx, actor);
    const order = await activeOrder(tx, actor, id, input.version);
    if (input.action === 'VOID' || input.action === 'CANCEL') {
      const owners = await tx.user.findMany({
        where: { storeId: actor.storeId, role: 'OWNER', isActive: true },
        select: { id: true, pinHash: true },
      });
      const success = pinLimiter.reserve(
        owners.map((owner) => owner.id),
        actor.ip ?? 'local',
      );
      if (!success) throw new HttpError(pinLockMessage, 429);
      let ownerId: string | undefined;
      for (const owner of owners)
        if (await compare(input.ownerPin, owner.pinHash)) {
          ownerId = owner.id;
          break;
        }
      if (!ownerId) throw new HttpError('PIN chủ quán không đúng', 403);
      success();
      if (input.action === 'VOID') {
        const item = order.items.find(
          (i) => i.id === input.itemId && i.status === 'ACTIVE',
        );
        if (!item) throw new HttpError('Món không còn trong đơn', 409);
        await tx.orderItem.update({
          where: { id: item.id },
          data: { status: 'VOIDED', voidReason: input.reason },
        });
        if (order.items.filter((i) => i.status === 'ACTIVE').length === 1)
          await tx.order.update({
            where: { id },
            data: { status: 'CANCELLED' },
          });
      } else {
        await tx.orderItem.updateMany({
          where: { orderId: id, status: 'ACTIVE' },
          data: { status: 'VOIDED', voidReason: input.reason },
        });
        await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
      }
      const updated = await recompute(tx, id);
      await audit(tx, actor, id, input.action, {
        ownerId,
        reason: input.reason,
        ...(input.action === 'VOID' ? { itemId: input.itemId } : {}),
        previousVersion: order.version,
        version: updated.version,
      });
      return updated;
    }
    if (input.action === 'MOVE') {
      if (input.tableId !== order.tableId)
        await checkTable(tx, actor, input.tableId, id);
      await tx.order.update({
        where: { id },
        data: { type: 'DINE_IN', tableId: input.tableId },
      });
      const updated = await recompute(tx, id);
      await audit(tx, actor, id, 'MOVE', {
        fromTableId: order.tableId,
        toTableId: input.tableId,
      });
      return updated;
    }
    if (input.action === 'MERGE') {
      if (input.sourceId === id)
        throw new HttpError('Không thể gộp đơn vào chính nó');
      const source = await activeOrder(
        tx,
        actor,
        input.sourceId,
        input.sourceVersion,
      );
      if (source.shiftId !== order.shiftId)
        throw new HttpError('Chỉ gộp đơn trong cùng ca', 409);
      const value = sumMoney([
        discountAmount(
          order.subtotal,
          order.discountType
            ? { type: order.discountType, value: order.discountValue }
            : undefined,
        ),
        discountAmount(
          source.subtotal,
          source.discountType
            ? { type: source.discountType, value: source.discountValue }
            : undefined,
        ),
      ]);
      await tx.orderItem.updateMany({
        where: { orderId: source.id, status: 'ACTIVE' },
        data: { orderId: id },
      });
      await tx.order.update({
        where: { id: source.id },
        data: {
          status: 'CANCELLED',
          subtotal: 0,
          total: 0,
          discountValue: 0,
          requestHash: null,
          version: { increment: 1 },
        },
      });
      const updated = await recompute(tx, id, { type: 'AMOUNT', value });
      await audit(tx, actor, id, 'MERGE', {
        sourceId: source.id,
        sourceCode: source.code,
        sourceVersion: source.version,
        targetVersion: order.version,
      });
      await audit(tx, actor, source.id, 'MERGED_INTO', { targetId: id });
      return updated;
    }
    if (new Set(input.items.map((i) => i.itemId)).size !== input.items.length)
      throw new HttpError('Món tách bị lặp');
    const selected = input.items.map((selection) => {
      const item = order.items.find(
        (i) => i.id === selection.itemId && i.status === 'ACTIVE',
      );
      if (!item || selection.quantity > item.quantity)
        throw new HttpError('Số lượng tách không hợp lệ');
      return { item, quantity: selection.quantity };
    });
    const active = order.items.filter((i) => i.status === 'ACTIVE');
    if (
      active.every((i) =>
        selected.some((s) => s.item.id === i.id && s.quantity === i.quantity),
      )
    )
      throw new HttpError('Cần giữ lại ít nhất một món trong đơn gốc');
    if (await tx.order.findUnique({ where: { id: input.newId } }))
      throw new HttpError('Mã đơn tách đã tồn tại. Vui lòng tải lại.', 409);
    const movedSubtotal = cartTotal(
      selected.map(({ item, quantity }) => ({
        price: item.priceSnapshot,
        quantity,
        toppings: item.toppings.map((t) => t.priceSnapshot),
      })),
    ).subtotal;
    const allocation = allocateDiscount(
      order.subtotal,
      discountAmount(
        order.subtotal,
        order.discountType
          ? { type: order.discountType, value: order.discountValue }
          : undefined,
      ),
      movedSubtotal,
    );
    const newOrder = await tx.order.create({
      data: {
        id: input.newId,
        storeId: actor.storeId,
        shiftId: order.shiftId,
        createdBy: actor.id,
        type: order.type,
        tableId: order.tableId,
        ...(await nextOrderCode(tx, actor.storeId)),
        discountType: 'AMOUNT',
        discountValue: allocation.moved,
        note: order.note,
      },
    });
    for (const { item, quantity } of selected) {
      if (quantity === item.quantity)
        await tx.orderItem.update({
          where: { id: item.id },
          data: { orderId: newOrder.id },
        });
      else {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - quantity },
        });
        const copy = await tx.orderItem.create({
          data: {
            storeId: actor.storeId,
            orderId: newOrder.id,
            productId: item.productId,
            variantId: item.variantId,
            nameSnapshot: item.nameSnapshot,
            priceSnapshot: item.priceSnapshot,
            quantity,
            note: item.note,
          },
        });
        if (item.toppings.length)
          await tx.orderItemTopping.createMany({
            data: item.toppings.map((t) => ({
              storeId: actor.storeId,
              orderItemId: copy.id,
              toppingId: t.toppingId,
              nameSnapshot: t.nameSnapshot,
              priceSnapshot: t.priceSnapshot,
            })),
          });
      }
    }
    const updated = await recompute(tx, id, {
      type: 'AMOUNT',
      value: allocation.remaining,
    });
    await recompute(tx, newOrder.id);
    await audit(tx, actor, id, 'SPLIT', {
      newOrderId: newOrder.id,
      items: input.items,
      discountAllocation: allocation,
    });
    return updated;
  });
}
