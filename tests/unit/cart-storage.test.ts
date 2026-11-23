import { beforeEach, it, expect, vi } from 'vitest';
import {
  readWorkingCart,
  saveWorkingCart,
  clearWorkingCart,
  tabPaymentId,
  type WorkingCart,
} from '../../lib/cart-storage';
const values = new Map<string, string>();
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  });
});
const cart = (): WorkingCart => ({
  version: 1,
  id,
  paymentId: other,
  lines: [
    {
      id: 'line',
      productId: id,
      variantId: other,
      quantity: 2,
      toppingIds: [id],
      note: 'ít đá',
    },
  ],
  type: 'DINE_IN',
  tableId: other,
  discountType: 'AMOUNT',
  discountValue: '5.000',
  prepared: null,
});
it('keeps retries stable within a tab without making another window reuse the same payment identity', () => {
  let tab = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => tab.get(key) ?? null,
    setItem: (key: string, value: string) => tab.set(key, value),
  });
  expect(tabPaymentId('user', id, id)).toBe(id);
  expect(tabPaymentId('user', id, other)).toBe(id);
  tab = new Map();
  expect(tabPaymentId('user', id, other)).toBe(other);
});
it('restores the same order/payment UUID, modifiers, table and discount after reload', () => {
  saveWorkingCart('user', 'new', cart());
  expect(readWorkingCart('user', 'new')).toEqual(cart());
  expect(readWorkingCart('user', id)).toEqual(cart());
  expect(readWorkingCart('other-user', 'new')).toBeNull();
  expect(readWorkingCart('user', 'table:another')).toBeNull();
});
it('retains the stale base version and unsaved edits rather than silently adopting fresh server data', () => {
  const saved = cart();
  const snapshot = {
    id: 'saved-line',
    productId: id,
    variantId: other,
    nameSnapshot: 'Coffee · M',
    priceSnapshot: 25000,
    quantity: 1,
    note: '',
    status: 'ACTIVE' as const,
    toppings: [],
  };
  saved.lines[0].snapshot = snapshot;
  saved.prepared = {
    id,
    code: 'CF001',
    version: 1,
    tableId: other,
    type: 'DINE_IN',
    status: 'OPEN',
    subtotal: 25000,
    discountType: null,
    discountValue: 0,
    total: 25000,
    note: '',
    createdAt: '2026-11-23T00:00:00.000Z',
    paidAt: null,
    createdBy: id,
    creator: { name: 'Lan' },
    table: { name: 'B1', area: 'Trong nhà' },
    items: [snapshot],
    payments: [],
  };
  saveWorkingCart('user', id, saved);
  expect(readWorkingCart('user', id)).toEqual(saved);
});
it('clears only the successful cart and its aliases, not another active device cart', () => {
  saveWorkingCart('user', 'new', cart());
  saveWorkingCart('user', id, cart());
  saveWorkingCart('user', 'new', { ...cart(), id: other });
  clearWorkingCart('user', id, id);
  expect(readWorkingCart('user', id)).toBeNull();
  expect(readWorkingCart('user', 'new')?.id).toBe(other);
  clearWorkingCart('user', 'new');
  expect(readWorkingCart('user', 'new')).toBeNull();
});
it('handles absent storage, corrupt records and write failures without silently deleting saved data', () => {
  expect(readWorkingCart('user', 'new')).toBeNull();
  saveWorkingCart('user', 'new', cart());
  const key = 'cafe-pos-working:user:order:' + id;
  values.set(key, '{');
  expect(() => readWorkingCart('user', 'new')).toThrow();
  expect(values.get(key)).toBe('{');
  const storage = globalThis.localStorage;
  vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(() => saveWorkingCart('user', 'new', cart())).toThrow('quota');
  expect(values.get(key)).toBe('{');
});
