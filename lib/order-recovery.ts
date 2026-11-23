import type { SaleOrder, MenuVariant } from './sales-types';
export function orderCompletionMessage(
  order: Pick<SaleOrder, 'status' | 'total' | 'tableId'>,
) {
  if (order.status === 'CANCELLED')
    return (
      'Đơn đã hủy, tổng tiền còn 0 ₫.' +
      (order.tableId ? ' Bàn đã được giải phóng khỏi đơn này.' : '')
    );
  if (order.status === 'PAID')
    return 'Đơn đã được thanh toán trước đó. Không nhận thêm tiền; kiểm tra hóa đơn.';
  return 'Đã cập nhật đơn';
}
export type WorkingLine = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  toppingIds: string[];
  note: string;
  snapshot?: SaleOrder['items'][number];
};
export function orderLineVariant(
  line: WorkingLine,
  variants: MenuVariant[],
): MenuVariant {
  const current = variants.find((variant) => variant.id === line.variantId);
  if (current) return current;
  if (line.snapshot)
    return {
      id: line.variantId,
      name: line.snapshot.nameSnapshot.split(' · ').at(-1) ?? 'Cỡ đã lưu',
      price: line.snapshot.priceSnapshot,
    };
  throw new Error('Không tìm thấy size của món. Hãy kiểm tra lại thực đơn.');
}
export function orderLines(order?: SaleOrder): WorkingLine[] {
  return (
    order?.items
      .filter((i) => i.status === 'ACTIVE')
      .map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        toppingIds: i.toppings.map((t) => t.toppingId),
        note: i.note,
        snapshot: i,
      })) ?? []
  );
}
export function reapplyPending(
  base: SaleOrder,
  fresh: SaleOrder,
  working: WorkingLine[],
) {
  if (fresh.id !== base.id || fresh.status !== 'OPEN')
    throw new Error('Đơn không còn mở. Món chưa lưu vẫn được giữ để kiểm tra.');
  const merged = orderLines(fresh);
  for (const line of working) {
    const old = base.items.find((i) => i.id === line.snapshot?.id);
    if (!old) {
      merged.push({ ...line, snapshot: undefined });
      continue;
    }
    const delta = Math.max(0, line.quantity - old.quantity);
    const current = merged.find((i) => i.id === old.id);
    if (current) {
      current.quantity += delta;
      if (line.note !== old.note) current.note = line.note;
    } else if (delta > 0)
      merged.push({
        ...line,
        id: 'pending-' + line.id,
        quantity: delta,
        snapshot: undefined,
      });
  }
  if (merged.some((line) => line.quantity > 99))
    throw new Error(
      'Số lượng sau ghép vượt 99. Món chưa lưu vẫn được giữ; hãy kiểm tra lại.',
    );
  return merged;
}
