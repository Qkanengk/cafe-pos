import { describe, it, expect } from 'vitest';
import { allocateDiscount, startingPrice, sumMoney } from '../../lib/money';
import { seedMenu } from '../../prisma/menu';
import { operationSchema, editOrderSchema } from '../../lib/sales-validation';
const id = '7ff9e456-8548-4f88-9c18-1d2b655de2ce';
describe('fresh menu and money', () => {
  it('seeds varied drink sizes and one portion per cake', () => {
    const products = seedMenu.flatMap((c) => c.products);
    expect(products).toHaveLength(20);
    expect(products.find((p) => p.name === 'Cà phê đen')?.prices).toEqual([
      20000, 25000, 30000,
    ]);
    expect(new Set(products.map((p) => p.prices[0])).size).toBeGreaterThan(10);
    expect(
      seedMenu
        .find((c) => c.name === 'Bánh')
        ?.products.every((p) => p.prices.length === 1),
    ).toBe(true);
  });
  it('labels starting price only when prices differ and validates amounts', () => {
    expect(startingPrice([30000, 20000, 25000])).toBe('từ 20.000 ₫');
    expect(startingPrice([29000])).toBe('29.000 ₫');
    expect(startingPrice([30000, 30000])).toBe('30.000 ₫');
    expect(startingPrice([])).toBe('Chưa có giá');
    expect(() => startingPrice([-1])).toThrow();
  });
  it('allocates discounts without changing the combined total', () => {
    expect(allocateDiscount(100000, 15000, 30000)).toEqual({
      moved: 4500,
      remaining: 10500,
    });
    expect(allocateDiscount(3, 1, 2)).toEqual({ moved: 1, remaining: 0 });
    expect(allocateDiscount(0, 0, 0)).toEqual({ moved: 0, remaining: 0 });
    expect(allocateDiscount(2147483647, 2147483647, 2000000000)).toEqual({
      moved: 2000000000,
      remaining: 147483647,
    });
    expect(() => allocateDiscount(1, 2, 1)).toThrow();
    expect(() => allocateDiscount(1, 0, 2)).toThrow();
    expect(() => allocateDiscount(1, 0, -1)).toThrow();
  });
  it('sums table running totals including empty maps and rejects bad inputs', () => {
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([10000, 20000])).toBe(30000);
    expect(() => sumMoney([-1])).toThrow();
    expect(() => sumMoney([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});
describe('order operation validation', () => {
  it('requires version, reason and owner PIN for void/cancel', () => {
    expect(
      operationSchema.safeParse({
        action: 'VOID',
        version: 1,
        itemId: id,
        ownerPin: '1111',
        reason: 'Pha sai',
      }).success,
    ).toBe(true);
    for (const body of [
      { action: 'CANCEL', version: 1, ownerPin: '1111', reason: ' ' },
      { action: 'CANCEL', version: 1, reason: 'Sai' },
      { action: 'CANCEL', ownerPin: '1111', reason: 'Sai' },
      {
        action: 'VOID',
        version: 1,
        itemId: id,
        ownerPin: '123',
        reason: 'Sai',
      },
    ])
      expect(operationSchema.safeParse(body).success).toBe(false);
  });
  it('rejects empty and invalid splits and missing merge versions', () => {
    expect(
      operationSchema.safeParse({
        action: 'SPLIT',
        version: 1,
        newId: id,
        items: [],
      }).success,
    ).toBe(false);
    expect(
      operationSchema.safeParse({
        action: 'SPLIT',
        version: 1,
        newId: id,
        items: [{ itemId: id, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      operationSchema.safeParse({ action: 'MERGE', version: 1, sourceId: id })
        .success,
    ).toBe(false);
    expect(editOrderSchema.safeParse({ order: {} }).success).toBe(false);
  });
});
