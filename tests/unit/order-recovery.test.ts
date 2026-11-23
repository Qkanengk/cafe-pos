import { it, expect } from 'vitest';
import {
  orderLines,
  reapplyPending,
  orderCompletionMessage,
  orderLineVariant,
  restoreLineIdentities,
} from '../../lib/order-recovery';
import type { SaleOrder } from '../../lib/sales-types';
const item: SaleOrder['items'][number] = {
  id: 'i',
  productId: 'p',
  variantId: 'v',
  quantity: 1,
  note: '',
  status: 'ACTIVE',
  nameSnapshot: 'Coffee · M',
  priceSnapshot: 25000,
  toppings: [],
};
const base = { id: 'order', status: 'OPEN', items: [item] } as SaleOrder;
it('keeps a held historical size renderable after it is retired from the menu', () => {
  const line = orderLines(base)[0];
  expect(orderLineVariant(line, [])).toEqual({
    id: 'v',
    name: 'M',
    price: 25000,
  });
  expect(
    orderLineVariant(line, [{ id: 'v', name: 'M', price: 50000 }]).price,
  ).toBe(50000);
  expect(() => orderLineVariant({ ...line, snapshot: undefined }, [])).toThrow(
    'Không tìm thấy size',
  );
});
it('clearly confirms a cancelled last-item bill and released table', () => {
  expect(
    orderCompletionMessage({ status: 'CANCELLED', total: 0, tableId: 'table' }),
  ).toContain('Bàn đã được giải phóng');
  expect(
    orderCompletionMessage({ status: 'OPEN', total: 25000, tableId: null }),
  ).toBe('Đã cập nhật đơn');
  expect(
    orderCompletionMessage({ status: 'PAID', total: 25000, tableId: 'table' }),
  ).toContain('Không nhận thêm tiền');
});
it('keeps another window’s saved addition and this window’s pending Latte', () => {
  const fresh = {
    ...base,
    version: 2,
    items: [item, { ...item, id: 'other' }],
  };
  const pending = {
    id: 'local',
    productId: 'latte',
    variantId: 'latte-v',
    quantity: 1,
    note: 'ít đá',
    toppingIds: [],
  };
  expect(
    reapplyPending(base, fresh, [...orderLines(base), pending]).map(
      (i) => i.id,
    ),
  ).toEqual(['i', 'other', 'local']);
});
it('reapplies only quantity increases and never revives a voided saved item', () => {
  const working = orderLines(base);
  working[0].quantity = 2;
  expect(
    reapplyPending(
      base,
      { ...base, items: [{ ...item, quantity: 2 }] },
      working,
    )[0].quantity,
  ).toBe(2);
  const merged = reapplyPending(
    base,
    { ...base, items: [{ ...item, status: 'VOIDED' }] },
    working,
  );
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ quantity: 1, snapshot: undefined });
  expect(
    reapplyPending(base, { ...base, items: [] }, orderLines(base)),
  ).toEqual([]);
});
it('rejects settled orders and excessive quantities without changing the pending cart', () => {
  const working = orderLines(base);
  working[0].quantity = 100;
  expect(() =>
    reapplyPending(base, { ...base, status: 'PAID' }, working),
  ).toThrow('không còn mở');
  expect(() =>
    reapplyPending(
      base,
      { ...base, items: [{ ...item, quantity: 99 }] },
      working,
    ),
  ).toThrow('vượt 99');
  expect(working[0].quantity).toBe(100);
});
it('does not re-add a pending line already committed before the response was lost', () => {
  const pending = {
    id: 'client-line',
    productId: 'p',
    variantId: 'v',
    quantity: 1,
    toppingIds: [],
    note: '',
  };
  const fresh = {
    ...base,
    version: 2,
    items: [item, { ...item, id: pending.id }],
  };
  expect(
    reapplyPending(base, fresh, [...orderLines(base), pending]),
  ).toHaveLength(2);
});
it('does not restore split quantities for untouched or note-only pending lines', () => {
  const before = { ...base, items: [{ ...item, quantity: 5 }] },
    fresh = { ...base, items: [{ ...item, quantity: 2 }] };
  expect(reapplyPending(before, fresh, orderLines(before))[0].quantity).toBe(2);
  const working = orderLines(before);
  working[0].note = 'ít đá';
  expect(reapplyPending(before, fresh, working)[0]).toMatchObject({
    quantity: 2,
    note: 'ít đá',
  });
  working[0].quantity = 6;
  expect(reapplyPending(before, fresh, working)[0].quantity).toBe(3);
});
it('migrates old pending line keys to stable UUIDs without changing server identities', () => {
  const existing = orderLines(base);
  const legacy = { ...existing[0], id: 'pending-old-key', snapshot: undefined };
  const restored = restoreLineIdentities([...existing, legacy]);
  expect(restored[0]).toEqual(existing[0]);
  expect(restored[1].id).toMatch(/^[0-9a-f-]{36}$/);
  expect(restoreLineIdentities([restored[1]])).toEqual([restored[1]]);
  expect(restoreLineIdentities([])).toEqual([]);
});
