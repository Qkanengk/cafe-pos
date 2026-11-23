import { describe, it, expect } from 'vitest';
import { averageTicket, netLineRevenues } from '../../lib/money';
import { buildReport, reportRange, type ReportOrder } from '../../lib/reports';
const range = reportRange('2026-11-23', '2026-11-23');
const item = {
  id: 'item',
  productId: 'product',
  nameSnapshot: 'Cà phê · M',
  quantity: 2,
  priceSnapshot: 25000,
  status: 'ACTIVE' as const,
  voidReason: null,
  toppings: [{ priceSnapshot: 5000 }],
};
const order: ReportOrder = {
  id: 'order',
  code: 'CF-1',
  status: 'PAID',
  shiftId: 'shift',
  total: 54000,
  paidAt: new Date('2026-11-22T18:00:00Z'),
  discountType: 'PERCENT',
  discountValue: 10,
  shift: {
    id: 'shift',
    openedAt: new Date('2026-11-22T17:00:00Z'),
    opener: { name: 'Lan' },
  },
  payments: [{ method: 'CASH', amount: 54000 }],
  items: [item],
};
describe('owner reports', () => {
  it('reports paid revenue by Vietnam day, original shift, method and discounted item', () => {
    const data = buildReport(
      [order, { ...order, id: 'ignored', status: 'CANCELLED' }],
      [],
      [],
      range,
    );
    expect(data).toMatchObject({ revenue: 54000, count: 1, average: 54000 });
    expect(data.days).toEqual([
      { id: '2026-11-23', label: '2026-11-23', count: 1, revenue: 54000 },
    ]);
    expect(data.shifts[0]).toMatchObject({
      id: 'shift',
      revenue: 54000,
      count: 1,
    });
    expect(data.methods[0]).toMatchObject({ id: 'CASH', revenue: 54000 });
    expect(data.topQuantity[0]).toMatchObject({
      quantity: 2,
      revenue: 54000,
      name: 'Cà phê',
    });
  });
  it('empty ranges are zero, exclude other payment days and never divide by zero', () => {
    expect(buildReport([], [], [], range)).toMatchObject({
      count: 0,
      revenue: 0,
      average: 0,
      days: [],
      topQuantity: [],
      voids: [],
    });
    expect(
      buildReport(
        [{ ...order, paidAt: new Date('2026-11-23T17:00:00Z') }],
        [],
        [],
        range,
      ).count,
    ).toBe(0);
  });
  it('shows each void/cancel item once with reason and approving owner, not merged bills', () => {
    const orders = [
      {
        ...order,
        status: 'CANCELLED',
        items: [
          { ...item, status: 'VOIDED' as const, voidReason: 'Sai món' },
          {
            ...item,
            id: 'second',
            status: 'VOIDED' as const,
            voidReason: 'Khách về',
          },
        ],
      },
    ];
    const at = new Date('2026-11-23T01:00:00Z');
    const audits = [
      {
        id: 'a',
        entityId: 'order',
        action: 'VOID',
        createdAt: at,
        data: { itemId: 'item', ownerId: 'owner', reason: 'Sai món' },
      },
      {
        id: 'b',
        entityId: 'order',
        action: 'CANCEL',
        createdAt: new Date(at.getTime() + 1000),
        data: { ownerId: 'owner', reason: 'Khách về' },
      },
      {
        id: 'c',
        entityId: 'order',
        action: 'MERGED_INTO',
        createdAt: at,
        data: {},
      },
    ];
    const data = buildReport(
      orders,
      audits,
      [{ id: 'owner', name: 'Chủ quán' }],
      range,
    );
    expect(data.voids).toHaveLength(2);
    expect(data.voids.map((v) => v.reason)).toEqual(['Sai món', 'Khách về']);
    expect(
      data.voids.every((v) => v.owner === 'Chủ quán' && v.shiftId === 'shift'),
    ).toBe(true);
  });
  it('rejects invalid, reversed or excessive ranges', () => {
    expect(() => reportRange('2026-02-30')).toThrow();
    expect(() => reportRange('x')).toThrow();
    expect(() => reportRange('2026-11-24', '2026-11-23')).toThrow();
    expect(() => reportRange('2020-01-01', '2026-01-01')).toThrow();
  });
  it('money helpers preserve every VND and handle empty/error inputs', () => {
    expect(
      netLineRevenues(
        [
          { price: 1, quantity: 1 },
          { price: 1, quantity: 1 },
          { price: 1, quantity: 1 },
        ],
        1,
      ),
    ).toEqual([1, 0, 1]);
    expect(netLineRevenues([], 0)).toEqual([]);
    expect(() => netLineRevenues([], 1)).toThrow();
    expect(averageTicket(5, 2)).toBe(3);
    expect(averageTicket(0, 0)).toBe(0);
    expect(() => averageTicket(-1, 1)).toThrow();
  });
});
