export function parsePercentInput(value: string | number) {
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number(text) <= 100 ? Number(text) : NaN;
}
export function parseDiscountInput(
  value: string | number,
  type: 'PERCENT' | 'AMOUNT',
) {
  return type === 'PERCENT' ? parsePercentInput(value) : parseVndInput(value);
}
export function parseVndInput(value: string | number): number {
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+)$/.test(text))
    return NaN;
  const amount = Number(text.replace(/[.,]/g, ''));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 2147483647
    ? amount
    : NaN;
}
export function vndInputError(value: string | number) {
  const text = String(value).trim();
  if (text.startsWith('-'))
    return 'Số tiền không được âm. Giá bán phải lớn hơn 0 ₫.';
  if (
    /^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+)$/.test(text) &&
    Number(text.replace(/[.,]/g, '')) > 2147483647
  )
    return 'Số tiền quá lớn. Tối đa 2.147.483.647 ₫.';
  return 'Nhập số tiền nguyên (ví dụ 50.000, 50,000 hoặc 50000); không nhập số thập phân.';
}
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
export function cashNoteSuggestions(total: number): number[] {
  vnd(total);
  if (total === 0) return [];
  const notes = CASH_DENOMINATIONS.filter((note) => note > total);
  return notes.length
    ? [total, ...notes].slice(0, 4)
    : cashSuggestions(total).slice(0, 4);
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
export function startingPrice(prices: readonly number[]): string {
  if (!prices.length) return 'Chưa có giá';
  prices.forEach(vnd);
  return (
    (new Set(prices).size > 1 ? 'từ ' : '') + formatVnd(Math.min(...prices))
  );
}
export function allocateDiscount(
  totalSubtotal: number,
  discount: number,
  movedSubtotal: number,
) {
  vnd(totalSubtotal);
  vnd(discount);
  vnd(movedSubtotal);
  if (discount > totalSubtotal || movedSubtotal > totalSubtotal)
    throw new RangeError('Invalid allocation');
  const moved =
    totalSubtotal === 0
      ? 0
      : Number(
          (BigInt(discount) * BigInt(movedSubtotal) * 2n +
            BigInt(totalSubtotal)) /
            (BigInt(totalSubtotal) * 2n),
        );
  return { moved, remaining: discount - moved };
}
export function sumMoney(values: readonly number[]): number {
  return values.reduce((sum, value) => vnd(sum + vnd(value)), 0);
}
export function averageTicket(revenue: number, count: number): number {
  vnd(revenue);
  vnd(count);
  return count === 0
    ? 0
    : Number((BigInt(revenue) * 2n + BigInt(count)) / (BigInt(count) * 2n));
}
export function netLineRevenues(
  lines: readonly CartLine[],
  discount: number,
): number[] {
  let remaining = subtotal(lines),
    reduction = vnd(discount);
  if (reduction > remaining) throw new RangeError('Discount exceeds subtotal');
  return lines.map((line) => {
    const amount = lineTotal(line);
    const allocation = allocateDiscount(remaining, reduction, amount);
    remaining -= amount;
    reduction = allocation.remaining;
    return amount - allocation.moved;
  });
}
