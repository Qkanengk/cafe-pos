import { it, expect } from 'vitest';
import { orderHistoryWhere } from '../../lib/order-history';
const past = '11111111-1111-4111-8111-111111111111';
it('defaults to the current shift and permits a closed shift without dropping store scope', () => {
  expect(orderHistoryWhere('store', 'active', {})).toEqual({
    storeId: 'store',
    shiftId: 'active',
  });
  expect(orderHistoryWhere('store', undefined, {})).toEqual({
    storeId: 'store',
    shiftId: 'none',
  });
  expect(orderHistoryWhere('store', 'active', { shiftId: past })).toEqual({
    storeId: 'store',
    shiftId: past,
  });
});
it('finds past bills by Vietnam-local creation date', () => {
  expect(orderHistoryWhere('store', 'active', { date: '2026-11-23' })).toEqual({
    storeId: 'store',
    createdAt: {
      gte: new Date('2026-11-22T17:00:00Z'),
      lt: new Date('2026-11-23T17:00:00Z'),
    },
  });
});
it('rejects invalid shift and calendar values', () => {
  expect(() =>
    orderHistoryWhere('store', 'active', { shiftId: 'other' }),
  ).toThrow();
  expect(() =>
    orderHistoryWhere('store', 'active', { date: '2026-02-30' }),
  ).toThrow();
});
