import { it, expect } from 'vitest';
import { orderLines, reapplyPending } from '../../lib/order-recovery';
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
  ).toBe(3);
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
  working[0].quantity = 99;
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
  expect(working[0].quantity).toBe(99);
});
