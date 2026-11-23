import { describe, it, expect } from 'vitest';
import {
  parseVndInput,
  normalizeVndEditing,
  lineTotal,
  subtotal,
  cartTotal,
  discountAmount,
  changeDue,
  cashSuggestions,
  cashNoteSuggestions,
  vnd,
} from '../../lib/money';
describe('Vietnamese VND input', () => {
  it('normalizes partial grouping while editing without masking invalid characters', () => {
    for (const value of ['50.00', '5,000', '5000'])
      expect(parseVndInput(normalizeVndEditing(value))).toBe(5000);
    expect(normalizeVndEditing('')).toBe('');
    expect(parseVndInput(normalizeVndEditing('50a.00'))).toBeNaN();
  });
  it('accepts dots, commas, and ungrouped integer VND', () => {
    for (const value of ['500.000', '500,000', '500000', ' 500.000 ', 500000])
      expect(parseVndInput(value)).toBe(500000);
    expect(parseVndInput('1.250.000')).toBe(1250000);
    expect(parseVndInput('0')).toBe(0);
  });
  it('rejects empty, ambiguous fractions, mixed separators, and out-of-range amounts', () => {
    for (const value of [
      '',
      '500.5',
      '500,00',
      '1.000,000',
      '-1',
      'abc',
      '2147483648',
    ])
      expect(parseVndInput(value)).toBeNaN();
  });
});
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
  it('keeps useful banknotes within a four-button payment row', () => {
    expect(cashNoteSuggestions(76500)).toEqual([76500, 100000, 200000, 500000]);
    expect(cashNoteSuggestions(500000)).toEqual([500000, 600000]);
    expect(cashNoteSuggestions(765000)).toEqual([
      765000, 766000, 770000, 780000,
    ]);
    expect(cashNoteSuggestions(0)).toEqual([]);
    for (const invalid of [-1, 0.5, NaN])
      expect(() => cashNoteSuggestions(invalid)).toThrow();
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
