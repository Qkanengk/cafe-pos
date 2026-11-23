import { netLineRevenues, lineTotal, sumMoney } from './money';
import type { SaleOrder } from './sales-types';
export function planRefund(
  order: {
    items: SaleOrder['items'];
    total: number;
    refunds?: {
      items: { itemId: string; quantity: number; amount: number }[];
    }[];
  },
  selection?: { itemId: string; quantity: number }[],
) {
  const items = order.items.filter((i) => i.status === 'ACTIVE');
  const priced = items.map((i) => ({
    price: i.priceSnapshot,
    quantity: i.quantity,
    toppings: i.toppings.map((t) => t.priceSnapshot),
  }));
  const revenues = netLineRevenues(
    priced,
    sumMoney(priced.map(lineTotal)) - order.total,
  );
  const used = (itemId: string) =>
    order.refunds
      ?.flatMap((r) => r.items)
      .filter((i) => i.itemId === itemId)
      .reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const chosen =
    selection ??
    items
      .map((i) => ({ itemId: i.id, quantity: i.quantity - used(i.id) }))
      .filter((i) => i.quantity > 0);
  if (
    !chosen.length ||
    new Set(chosen.map((i) => i.itemId)).size !== chosen.length
  )
    throw new RangeError('Chọn món còn số lượng để hoàn');
  return chosen.map((line) => {
    const index = items.findIndex((i) => i.id === line.itemId),
      item = items[index];
    if (
      !item ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      used(item.id) + line.quantity > item.quantity
    )
      throw new RangeError('Số lượng hoàn vượt số món đã bán');
    const before = used(item.id),
      q = BigInt(item.quantity),
      amount = Number(
        (BigInt(revenues[index]) * BigInt(before + line.quantity)) / q -
          (BigInt(revenues[index]) * BigInt(before)) / q,
      );
    return { ...line, amount };
  });
}
