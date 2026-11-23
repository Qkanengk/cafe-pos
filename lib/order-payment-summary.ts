import { sumMoney, sumLedger, type PaymentValue } from './money';
export function orderPaymentSummary(
  payments: readonly Pick<PaymentValue, 'method' | 'amount'>[],
) {
  sumLedger(payments.map((p) => p.amount));
  return {
    methods: [
      ...new Set(payments.filter((p) => p.amount >= 0).map((p) => p.method)),
    ],
    refunded: sumMoney(
      payments.filter((p) => p.amount < 0).map((p) => -p.amount),
    ),
  };
}
