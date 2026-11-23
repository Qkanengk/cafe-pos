import { it, expect } from 'vitest';
import { orderPaymentSummary } from '../../lib/order-payment-summary';
it('deduplicates sale methods and reports refunds separately, not as additional sale methods', () => {
  expect(
    orderPaymentSummary([
      { method: 'CASH', amount: 20000 },
      { method: 'CASH', amount: 10000 },
      { method: 'BANK_TRANSFER', amount: -20000 },
    ]),
  ).toEqual({ methods: ['CASH'], refunded: 20000 });
  expect(
    orderPaymentSummary([
      { method: 'CASH', amount: 0 },
      { method: 'BANK_TRANSFER', amount: 10000 },
      { method: 'CASH', amount: -2000 },
    ]),
  ).toEqual({ methods: ['CASH', 'BANK_TRANSFER'], refunded: 2000 });
});
it('handles empty and refund-only ledgers without inventing a sale method', () => {
  expect(
    orderPaymentSummary([
      { method: 'BANK_TRANSFER', amount: 10000 },
      { method: 'CASH', amount: -2000 },
    ]),
  ).toEqual({ methods: ['BANK_TRANSFER'], refunded: 2000 });
  expect(orderPaymentSummary([])).toEqual({ methods: [], refunded: 0 });
  expect(
    orderPaymentSummary([{ method: 'BANK_TRANSFER', amount: -10000 }]),
  ).toEqual({ methods: [], refunded: 10000 });
});
it('rejects malformed financial amounts rather than hiding them', () => {
  expect(() => orderPaymentSummary([{ method: 'CASH', amount: NaN }])).toThrow(
    RangeError,
  );
});
