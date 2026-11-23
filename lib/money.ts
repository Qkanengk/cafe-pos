export function vnd(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('VND must be a non-negative safe integer');
  return value;
}
export type CartLine = {
  price: number;
  quantity: number;
  toppings?: readonly number[];
  status?: 'ACTIVE' | 'VOIDED';
};
export function lineTotal(line: CartLine): number {
  vnd(line.price);
  vnd(line.quantity);
  const toppings = (line.toppings ?? []).reduce(
    (sum, price) => vnd(sum + vnd(price)),
    0,
  );
  if (line.status === 'VOIDED') return 0;
  return vnd(vnd(line.price + toppings) * line.quantity);
}
export function subtotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => vnd(sum + lineTotal(line)), 0);
}
export type Discount = { type: 'PERCENT' | 'AMOUNT'; value: number };
export function discountAmount(amount: number, discount?: Discount): number {
  vnd(amount);
  if (!discount) return 0;
  vnd(discount.value);
  if (discount.type === 'PERCENT') {
    if (discount.value > 100)
      throw new RangeError('Percentage must be between 0 and 100');
    return Number((BigInt(amount) * BigInt(discount.value) + 50n) / 100n);
  }
  return Math.min(amount, discount.value);
}
export function cartTotal(lines: readonly CartLine[], discount?: Discount) {
  const amount = subtotal(lines);
  const reduction = discountAmount(amount, discount);
  return { subtotal: amount, discount: reduction, total: amount - reduction };
}
export function changeDue(total: number, received: number): number {
  vnd(total);
  vnd(received);
  if (received < total) throw new RangeError('Insufficient cash');
  return received - total;
}
export const CASH_DENOMINATIONS = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
] as const;
export function cashSuggestions(total: number): number[] {
  vnd(total);
  if (total === 0) return [];
  const suggestions = [
    total,
    ...CASH_DENOMINATIONS.map((note) => vnd(Math.ceil(total / note) * note)),
  ];
  return [...new Set(suggestions)].sort((a, b) => a - b).slice(0, 5);
}

export type PaymentValue = {
  method: 'CASH' | 'BANK_TRANSFER';
  amount: number;
  received?: number | null;
  change?: number | null;
};
export function paymentTotals(payments: readonly PaymentValue[]) {
  return payments.reduce(
    (totals, payment) => {
      vnd(payment.amount);
      if (payment.method === 'BANK_TRANSFER') {
        totals.bank = vnd(totals.bank + payment.amount);
      } else {
        const received = vnd(payment.received ?? payment.amount);
        const change = vnd(payment.change ?? 0);
        if (change > received)
          throw new RangeError('Change exceeds received cash');
        totals.cash = vnd(totals.cash + vnd(received - change));
      }
      return totals;
    },
    { cash: 0, bank: 0 },
  );
}
export function expectedCash(
  openingCash: number,
  payments: readonly PaymentValue[],
): number {
  return vnd(vnd(openingCash) + paymentTotals(payments).cash);
}
export function shiftDifference(expected: number, counted: number): number {
  return vnd(counted) - vnd(expected);
}
export function formatVnd(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError('Invalid VND');
  return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
}
