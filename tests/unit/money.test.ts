import { describe, it, expect } from 'vitest';
import {
  lineTotal,
  subtotal,
  cartTotal,
  discountAmount,
  changeDue,
  cashSuggestions,
  vnd,
} from '../../lib/money';
describe('integer VND', () => {
  it('prices toppings per item and ignores voided lines', () => {
    expect(
      lineTotal({ price: 25000, quantity: 2, toppings: [5000, 5000] }),
    ).toBe(70000);
    expect(
      subtotal([
        { price: 25000, quantity: 2 },
        { price: 10000, quantity: 1, status: 'VOIDED' },
      ]),
    ).toBe(50000);
  });
  it('handles empty carts and zero quantities', () => {
    expect(cartTotal([])).toEqual({ subtotal: 0, discount: 0, total: 0 });
    expect(lineTotal({ price: 100, quantity: 0 })).toBe(0);
    expect(cashSuggestions(0)).toEqual([]);
  });
  it('rounds percentage half up once and caps fixed discounts', () => {
    expect(discountAmount(101, { type: 'PERCENT', value: 50 })).toBe(51);
    expect(
      cartTotal([{ price: 30000, quantity: 2 }], {
        type: 'PERCENT',
        value: 10,
      }),
    ).toEqual({ subtotal: 60000, discount: 6000, total: 54000 });
    expect(discountAmount(100, { type: 'AMOUNT', value: 200 })).toBe(100);
  });
  it('calculates exact change and useful cash suggestions', () => {
    expect(changeDue(35000, 50000)).toBe(15000);
    expect(changeDue(0, 0)).toBe(0);
    expect(cashSuggestions(35000)).toEqual([
      35000, 36000, 40000, 50000, 100000,
    ]);
  });
  it('rejects invalid amounts, percentages, short cash and overflow', () => {
    for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => vnd(amount)).toThrow();
    expect(() => discountAmount(1, { type: 'PERCENT', value: 101 })).toThrow();
    expect(() => changeDue(10, 9)).toThrow();
    expect(() =>
      lineTotal({ price: Number.MAX_SAFE_INTEGER, quantity: 2 }),
    ).toThrow();
  });
});
