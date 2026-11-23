import { createHash } from 'node:crypto';
import { db } from './db';
import { HttpError } from './api';
import { verifyCatalog } from './offline-catalog';
import { cartTotal, changeDue } from './money';
import { lockStore, nextOrderCode, orderInclude } from './sales';
import { orderMatchesCheckout } from './order-match';
import type { SaleOrder } from './sales-types';
import type { SyncEntry } from './sync-validation';
import { auditDiscount } from './discount-audit';
export async function syncOrder(
  actor: { id: string; storeId: string },
  entry: SyncEntry,
) {
  if (entry.userId !== actor.id)
    throw new HttpError(
      'Đơn thuộc nhân viên khác. Đăng nhập đúng tài khoản để đồng bộ.',
      403,
    );
  const hash = createHash('sha256').update(JSON.stringify(entry)).digest('hex');
  return db.$transaction(async (tx) => {
    await lockStore(tx, actor.storeId);
    if (
      !(await tx.user.findFirst({
        where: { id: actor.id, storeId: actor.storeId, isActive: true },
      }))
    )
      throw new HttpError('Nhân viên đã ngừng hoạt động', 401);
    const existing = await tx.order.findUnique({
      where: { id: entry.order.id },
      include: orderInclude,
    });
    const unconfirmed =
      existing?.status === 'OPEN' &&
      existing.storeId === actor.storeId &&
      existing.createdBy === actor.id &&
      existing.shiftId === entry.shiftId &&
      existing.payments.length === 0 &&
      orderMatchesCheckout(existing as unknown as SaleOrder, entry.order);
    if (existing && !unconfirmed) {
      if (
        existing.storeId !== actor.storeId ||
        existing.createdBy !== actor.id ||
        existing.requestHash !== hash ||
        existing.payments[0]?.id !== entry.paymentId
      )
        throw new HttpError(
          'UUID đã dùng với nội dung khác. Đơn máy chủ đã được sửa/thanh toán hoặc không khớp đơn trên thiết bị. Không thu thêm tiền; mở Đơn hàng để đối chiếu. Đơn vẫn được giữ trên thiết bị.',
          409,
          existing.storeId === actor.storeId && existing.createdBy === actor.id
            ? { order: existing }
            : undefined,
        );
      return { id: existing.id, code: existing.code };
    }
    if (await tx.payment.findUnique({ where: { id: entry.paymentId } }))
      throw new HttpError('UUID thanh toán đã tồn tại', 409);
    const shift = await tx.shift.findFirst({
      where: { id: entry.shiftId, storeId: actor.storeId },
    });
    if (!shift) throw new HttpError('Không tìm thấy ca đã lưu', 409);
    const createdAt = new Date(entry.createdAt),
      paidAt = new Date(entry.paidAt);
    if (
      createdAt > paidAt ||
      paidAt.getTime() > Date.now() + 300000 ||
      createdAt.getTime() < shift.openedAt.getTime() - 300000 ||
      (shift.closedAt && paidAt > shift.closedAt)
    )
      throw new HttpError(
        'Thời gian bán không nằm trong ca đã lưu. Nhờ chủ quán kiểm tra; đơn vẫn còn trên thiết bị.',
        409,
      );
    const catalog = verifyCatalog(entry.catalogToken, actor);
    const lines = entry.order.lines.map((line) => {
      const product = catalog.products.find((p) =>
        p.variants.some((v) => v.id === line.variantId),
      );
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (!product?.isAvailable || !variant)
        throw new HttpError('Món không có trong thực đơn đã lưu', 409);
      const selected = line.toppingIds.map((id) => {
        if (product.toppings && !product.toppings.some((t) => t.id === id))
          throw new HttpError(
            'Topping không dùng cho món này trong thực đơn đã lưu',
            400,
          );
        const topping = catalog.toppings.find(
          (t) => t.id === id && t.isAvailable,
        );
        if (!topping)
          throw new HttpError('Topping không có trong thực đơn đã lưu', 409);
        return topping;
      });
      return { product, variant, selected, line };
    });
    const ids = await tx.productVariant.findMany({
      where: {
        storeId: actor.storeId,
        id: { in: lines.map((l) => l.variant.id) },
      },
      select: { id: true },
    });
    if (lines.some((l) => !ids.some((v) => v.id === l.variant.id)))
      throw new HttpError('Món đã bị xóa. Nhờ chủ quán kiểm tra đơn chờ.', 409);
    const toppingIds = lines.flatMap((l) => l.selected.map((t) => t.id));
    const toppings = await tx.topping.findMany({
      where: { storeId: actor.storeId, id: { in: toppingIds } },
      select: { id: true },
    });
    if (toppingIds.some((id) => !toppings.some((t) => t.id === id)))
      throw new HttpError(
        'Topping đã bị xóa. Nhờ chủ quán kiểm tra đơn chờ.',
        409,
      );
    if (
      entry.order.type === 'DINE_IN' &&
      !(await tx.table.findFirst({
        where: { id: entry.order.tableId, storeId: actor.storeId },
      }))
    )
      throw new HttpError('Bàn không tồn tại', 409);
    const totals = cartTotal(
      lines.map((l) => ({
        price: l.variant.price,
        quantity: l.line.quantity,
        toppings: l.selected.map((t) => t.price),
      })),
      entry.order.discount,
    );
    if (totals.subtotal > 2147483647 || totals.total > 2147483647)
      throw new HttpError('Giá trị đơn vượt giới hạn');
    const change =
      entry.payment.method === 'CASH'
        ? changeDue(totals.total, entry.payment.received)
        : null;
    if (
      unconfirmed &&
      (existing.total !== totals.total ||
        existing.subtotal !== totals.subtotal ||
        JSON.stringify(
          existing.items
            .filter((item) => item.status === 'ACTIVE')
            .map((item) =>
              JSON.stringify([
                item.variantId,
                item.quantity,
                item.note,
                item.priceSnapshot,
                item.toppings.map((t) => [t.toppingId, t.priceSnapshot]).sort(),
              ]),
            )
            .sort(),
        ) !==
          JSON.stringify(
            lines
              .map(({ line, variant, selected }) =>
                JSON.stringify([
                  variant.id,
                  line.quantity,
                  line.note,
                  variant.price,
                  selected.map((t) => [t.id, t.price]).sort(),
                ]),
              )
              .sort(),
          ))
    )
      throw new HttpError(
        'Giá trị hoặc giá từng món/topping trên máy chủ khác đơn đã bán. Giữ đơn để chủ quán đối chiếu; không tự ghi đè.',
        409,
      );
    const numbering = unconfirmed
      ? {
          businessDate: existing.businessDate,
          dailyNumber: existing.dailyNumber,
          code: existing.code,
        }
      : await nextOrderCode(tx, actor.storeId, paidAt);
    const data = {
      id: entry.order.id,
      storeId: actor.storeId,
      shiftId: shift.id,
      createdBy: actor.id,
      type: entry.order.type,
      tableId: entry.order.type === 'DINE_IN' ? entry.order.tableId : null,
      status: 'PAID' as const,
      createdAt,
      paidAt,
      subtotal: totals.subtotal,
      total: totals.total,
      discountType: entry.order.discount?.type,
      discountValue: entry.order.discount?.value ?? 0,
      note: entry.order.note,
      requestHash: hash,
      ...numbering,
    };
    if (unconfirmed) {
      await tx.order.update({
        where: { id: entry.order.id },
        data: {
          status: 'PAID',
          paidAt,
          requestHash: hash,
          version: { increment: 1 },
        },
      });
    } else await tx.order.create({ data });
    for (const { product, variant, selected, line } of unconfirmed
      ? []
      : lines) {
      const item = await tx.orderItem.create({
        data: {
          id: line.clientLineId,
          storeId: actor.storeId,
          orderId: entry.order.id,
          productId: product.id,
          variantId: variant.id,
          nameSnapshot: product.name + ' · ' + variant.name,
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
    await tx.payment.create({
      data: {
        id: entry.paymentId,
        storeId: actor.storeId,
        orderId: entry.order.id,
        method: entry.payment.method,
        amount: totals.total,
        received:
          entry.payment.method === 'CASH' ? entry.payment.received : null,
        change,
        confirmedBy: actor.id,
        createdAt: paidAt,
      },
    });
    await tx.auditLog.create({
      data: {
        storeId: actor.storeId,
        userId: actor.id,
        entity: 'orders',
        entityId: entry.order.id,
        action: 'SYNC',
        data: {
          localCode: 'TAM-' + entry.order.id.slice(0, 8).toUpperCase(),
          paymentId: entry.paymentId,
          shiftId: shift.id,
        },
      },
    });
    await auditDiscount(tx, actor, {
      id: entry.order.id,
      subtotal: totals.subtotal,
      total: totals.total,
      discountType: entry.order.discount?.type ?? null,
      discountValue: entry.order.discount?.value ?? 0,
    });
    return { id: entry.order.id, code: numbering.code };
  });
}
