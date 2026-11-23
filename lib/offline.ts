'use client';
import Dexie, { type EntityTable } from 'dexie';
import { posFetch } from './pos-fetch';
import { PaymentConflictError } from './payment-conflict';
import { cartTotal, changeDue } from './money';
import type { OfflineSnapshot, LocalDraft } from './offline-types';
import type { SyncEntry } from './sync-validation';
import type { SaleOrder } from './sales-types';
import type { z } from 'zod';
import type { checkoutSchema, paymentSchema } from './sales-validation';
export type PendingOrder = {
  id: string;
  userId: string;
  entry: SyncEntry;
  order: SaleOrder;
  error?: string;
  attempts?: number;
  retryAt?: number;
};
const local = new Dexie('cafe-pos-offline') as Dexie & {
  snapshots: EntityTable<{ id: string; data: OfflineSnapshot }, 'id'>;
  drafts: EntityTable<LocalDraft, 'id'>;
  outbox: EntityTable<PendingOrder, 'id'>;
  receipts: EntityTable<{ id: string; userId: string; code: string }, 'id'>;
};
local.version(1).stores({
  snapshots: 'id',
  drafts: 'id,userId',
  outbox: 'id,userId',
  receipts: 'id,userId',
});
export function offlineChanged() {
  window.dispatchEvent(new Event('cafe-offline-change'));
}
export async function cachedSnapshot() {
  const record = await local.snapshots.get('active');
  if (!record || Date.now() > record.data.validUntil)
    throw new Error(
      'Phiên ngoại tuyến đã hết hạn. Kết nối và đăng nhập lại; đơn chờ vẫn được giữ.',
    );
  return record.data;
}
export async function refreshSnapshot() {
  const response = await posFetch('/api/menu', { cache: 'no-store' });
  if (!response.ok) throw new Error('Kết nối và đăng nhập lại để đồng bộ.');
  const data: OfflineSnapshot = await response.json();
  await local.snapshots.put({ id: 'active', data });
  return data;
}
export async function prepareLocal(
  input: z.infer<typeof checkoutSchema>,
): Promise<SaleOrder> {
  const snapshot = await cachedSnapshot();
  if (!snapshot.shift)
    throw new Error(
      'Chưa có ca mở được lưu trên máy. Kết nối và mở ca trước khi bán ngoại tuyến.',
    );
  if (input.lines.some((l) => l.itemId))
    throw new Error(
      'Đơn máy chủ cần có mạng để sửa. Hãy tạo đơn mới khi ngoại tuyến.',
    );
  const previous = await local.drafts.get(input.id);
  const items = input.lines.map((line) => {
    const product = snapshot.products.find((p) =>
      p.variants.some((v) => v.id === line.variantId),
    );
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product?.isAvailable || !variant)
      throw new Error('Món không có trong thực đơn đã lưu');
    const toppings = line.toppingIds.map((id) => {
      if (product.toppings && !product.toppings.some((t) => t.id === id))
        throw new Error('Topping không dùng cho món này');
      const topping = snapshot.toppings.find(
        (t) => t.id === id && t.isAvailable,
      );
      if (!topping) throw new Error('Topping không còn bán');
      return {
        id: crypto.randomUUID(),
        toppingId: id,
        nameSnapshot: topping.name,
        priceSnapshot: topping.price,
      };
    });
    return {
      id: line.clientLineId ?? crypto.randomUUID(),
      productId: product.id,
      variantId: variant.id,
      nameSnapshot: product.name + ' · ' + variant.name,
      priceSnapshot: variant.price,
      quantity: line.quantity,
      note: line.note,
      status: 'ACTIVE' as const,
      toppings,
    };
  });
  const totals = cartTotal(
    items.map((i) => ({
      price: i.priceSnapshot,
      quantity: i.quantity,
      toppings: i.toppings.map((t) => t.priceSnapshot),
    })),
    input.discount,
  );
  const table = snapshot.tables.find((t) => t.id === input.tableId);
  if (input.type === 'DINE_IN' && !table)
    throw new Error('Bàn không có trên thiết bị');
  const order: SaleOrder = {
    id: input.id,
    code: 'TAM-' + input.id.slice(0, 8).toUpperCase(),
    version: 1,
    tableId: input.type === 'DINE_IN' ? input.tableId! : null,
    type: input.type,
    status: 'OPEN',
    subtotal: totals.subtotal,
    total: totals.total,
    discountType: input.discount?.type ?? null,
    discountValue: input.discount?.value ?? 0,
    note: input.note,
    createdAt: previous?.order.createdAt ?? new Date().toISOString(),
    paidAt: null,
    createdBy: snapshot.user.id,
    creator: { name: snapshot.user.name },
    table: table ? { name: table.name, area: table.area } : null,
    items,
    payments: [],
  };
  await local.drafts.put({
    id: order.id,
    userId: snapshot.user.id,
    catalogToken: snapshot.catalogToken,
    shiftId: snapshot.shift.id,
    input,
    order,
  });
  offlineChanged();
  return order;
}
export async function payLocal(
  order: SaleOrder,
  payment: z.infer<typeof paymentSchema>,
) {
  const snapshot = await cachedSnapshot();
  const existing = await local.outbox.get(order.id);
  if (existing && existing.userId === snapshot.user.id) {
    if (
      payment.id === existing.entry.paymentId &&
      payment.method === existing.entry.payment.method &&
      (payment.method !== 'CASH' ||
        (existing.entry.payment.method === 'CASH' &&
          payment.received === existing.entry.payment.received))
    )
      return existing.order;
    throw new PaymentConflictError(existing.order);
  }
  const draft = await local.drafts.get(order.id);
  if (!draft || draft.userId !== snapshot.user.id || !snapshot.shift)
    throw new Error('Không tìm thấy đơn/ca ngoại tuyến của nhân viên này');
  if (draft.shiftId && draft.shiftId !== snapshot.shift.id)
    throw new Error(
      'Ca của đơn đã thay đổi. Chưa nhận tiền: hãy mở lại đơn và kiểm tra trong ca hiện tại. Đơn cũ vẫn được giữ trên thiết bị.',
    );
  const content = (sale: SaleOrder) =>
    JSON.stringify([
      sale.type,
      sale.tableId,
      sale.note,
      sale.subtotal,
      sale.total,
      sale.discountType,
      sale.discountValue,
      sale.items,
    ]);
  if (content(order) !== content(draft.order))
    throw new Error(
      'Đơn trên thiết bị đã thay đổi. Hãy mở lại đơn để kiểm tra trước khi nhận tiền.',
    );
  if (!draft.catalogToken || !draft.shiftId)
    throw new Error(
      'Đơn cũ thiếu bảng giá đã lưu. Kết nối và kiểm tra lại đơn trước khi thanh toán.',
    );
  const id = payment.id ?? crypto.randomUUID(),
    paidAt = new Date().toISOString();
  const received = payment.method === 'CASH' ? payment.received : null;
  const change =
    payment.method === 'CASH' ? changeDue(order.total, payment.received) : null;
  const paid: SaleOrder = {
    ...order,
    status: 'PAID',
    paidAt,
    payments: [
      {
        id,
        method: payment.method,
        amount: order.total,
        received,
        change,
        confirmedBy: snapshot.user.id,
      },
    ],
  };
  const entry: SyncEntry = {
    order: draft.input,
    userId: snapshot.user.id,
    shiftId: draft.shiftId,
    paymentId: id,
    createdAt: order.createdAt,
    paidAt,
    catalogToken: draft.catalogToken,
    payment,
  };
  const saved = await local.transaction(
    'rw',
    local.outbox,
    local.drafts,
    async () => {
      const concurrent = await local.outbox.get(order.id);
      if (concurrent) {
        if (
          concurrent.entry.paymentId === id &&
          concurrent.entry.payment.method === payment.method &&
          (payment.method !== 'CASH' ||
            (concurrent.entry.payment.method === 'CASH' &&
              concurrent.entry.payment.received === payment.received))
        )
          return concurrent.order;
        throw new PaymentConflictError(concurrent.order);
      }
      await local.outbox.add({
        id: order.id,
        userId: snapshot.user.id,
        entry,
        order: paid,
      });
      await local.drafts.delete(order.id);
      return paid;
    },
  );
  offlineChanged();
  return saved;
}
export async function localDraft(id: string) {
  const snapshot = await cachedSnapshot();
  const draft = await local.drafts.get(id);
  return draft?.userId === snapshot.user.id ? draft : undefined;
}
export async function localDrafts() {
  const snapshot = navigator.onLine
    ? await refreshSnapshot().catch(() => cachedSnapshot())
    : await cachedSnapshot();
  return local.drafts.where('userId').equals(snapshot.user.id).toArray();
}
export async function syncedCode(id: string) {
  const snapshot = await local.snapshots.get('active');
  const receipt = await local.receipts.get(id);
  return receipt?.userId === snapshot?.data.user.id ? receipt?.code : undefined;
}
export async function pendingState() {
  const record = await local.snapshots.get('active');
  if (!record) return { count: 0, error: '' };
  const orders = await local.outbox
    .where('userId')
    .equals(record.data.user.id)
    .toArray();
  return {
    count: orders.length,
    error: orders.find((o) => o.error)?.error ?? '',
  };
}
let syncing = false;
async function deferSync(pending: PendingOrder[], error: string) {
  for (const order of pending) {
    const attempts = (order.attempts ?? 0) + 1;
    await local.outbox.update(order.id, {
      error,
      attempts,
      retryAt:
        Date.now() + Math.min(300000, 10000 * 2 ** Math.min(attempts, 5)),
    });
  }
}
export async function syncPending() {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  let pending: PendingOrder[] = [];
  try {
    const record = await local.snapshots.get('active');
    if (!record) return;
    const snapshot = record.data;
    const queued = await local.outbox
      .where('userId')
      .equals(snapshot.user.id)
      .toArray();
    pending = queued
      .filter((order) => (order.retryAt ?? 0) <= Date.now())
      .sort((a, b) => (a.retryAt ?? 0) - (b.retryAt ?? 0))
      .slice(0, 20);
    if (!pending.length) return;
    const response = await posFetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: pending.map((p) => p.entry) }),
    });
    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: 'Không thể đồng bộ' }));
      throw new Error(body.error ?? 'Không thể đồng bộ');
    }
    const { results } = (await response.json()) as {
      results: { id: string; ok: boolean; code?: string; error?: string }[];
    };
    for (const order of pending) {
      const result = results.find((r) => r.id === order.id) ?? {
        id: order.id,
        ok: false,
        error: 'Máy chủ chưa xác nhận đơn',
      };
      if (result.ok && result.code)
        await local.transaction(
          'rw',
          local.outbox,
          local.receipts,
          async () => {
            await local.receipts.put({
              id: result.id,
              userId: snapshot.user.id,
              code: result.code!,
            });
            await local.outbox.delete(result.id);
          },
        );
      else await deferSync([order], result.error ?? 'Đồng bộ thất bại');
    }
  } catch (error) {
    await deferSync(
      pending,
      error instanceof Error ? error.message : 'Không thể đồng bộ',
    );
    throw error;
  } finally {
    syncing = false;
    offlineChanged();
  }
}
