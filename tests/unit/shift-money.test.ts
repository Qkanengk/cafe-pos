import { describe, it, expect } from 'vitest';
import {
  expectedCash,
  paymentTotals,
  shiftDifference,
  formatVnd,
} from '../../lib/money';
describe('shift reconciliation', () => {
  it('includes cash tender minus change and excludes bank transfers', () => {
    const payments = [
      {
        method: 'CASH' as const,
        amount: 85000,
        received: 100000,
        change: 15000,
      },
      { method: 'BANK_TRANSFER' as const, amount: 30000 },
    ];
    expect(paymentTotals(payments)).toEqual({ cash: 85000, bank: 30000 });
    expect(expectedCash(500000, payments)).toBe(585000);
    expect(shiftDifference(585000, 585000)).toBe(0);
    expect(shiftDifference(585000, 580000)).toBe(-5000);
    expect(shiftDifference(585000, 590000)).toBe(5000);
  });
  it('handles an empty shift, zero-value payments and legacy cash amounts', () => {
    expect(expectedCash(0, [])).toBe(0);
    expect(expectedCash(100000, [])).toBe(100000);
    expect(
      paymentTotals([
        { method: 'CASH', amount: 0, received: 1000, change: 1000 },
      ]),
    ).toEqual({ cash: 0, bank: 0 });
    expect(expectedCash(1000, [{ method: 'CASH', amount: 1000 }])).toBe(2000);
    expect(formatVnd(0)).toContain('0');
    expect(formatVnd(-1000)).toContain('-1');
  });
  it('rejects invalid values, invalid change and overflow', () => {
    expect(() => expectedCash(-1, [])).toThrow();
    expect(() =>
      expectedCash(0, [
        { method: 'CASH', amount: 10, received: 10, change: 11 },
      ]),
    ).toThrow();
    expect(() =>
      expectedCash(Number.MAX_SAFE_INTEGER, [{ method: 'CASH', amount: 1 }]),
    ).toThrow();
    expect(() => shiftDifference(0, 0.5)).toThrow();
    expect(() => formatVnd(NaN)).toThrow();
  });
  it('does not overflow intermediate tender when change returns most of it', () => {
    expect(
      paymentTotals([
        { method: 'CASH', amount: 1 },
        {
          method: 'CASH',
          amount: 0,
          received: Number.MAX_SAFE_INTEGER,
          change: Number.MAX_SAFE_INTEGER,
        },
      ]).cash,
    ).toBe(1);
  });
});
