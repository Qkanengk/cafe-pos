import { formatVnd } from './money';
const actions: Record<string, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa',
  OPEN: 'Mở ca',
  CLOSE: 'Đóng ca',
  HOLD: 'Giữ đơn',
  PAY: 'Thu tiền',
  DISCOUNT: 'Áp dụng giảm giá',
  VOID: 'Hủy món',
  CANCEL: 'Hủy đơn',
  MERGE: 'Gộp đơn',
  SPLIT: 'Tách đơn',
  MOVE: 'Chuyển bàn',
  SYNC: 'Đồng bộ đơn',
  REFUND: 'Hoàn tiền',
  SHARE: 'Chia đều hóa đơn',
};
const entities: Record<string, string> = {
  orders: 'Đơn hàng',
  products: 'Món',
  categories: 'Danh mục',
  toppings: 'Topping',
  users: 'Nhân viên',
  settings: 'Thông tin quán',
  shifts: 'Ca làm việc',
};
export const auditActionLabel = (action: string) =>
  actions[action] ?? 'Cập nhật hoạt động';
export const auditEntityLabel = (entity: string) =>
  entities[entity] ?? 'Dữ liệu của quán';
export function auditDescription(value: unknown) {
  if (!value || typeof value !== 'object') return 'Không có ghi chú bổ sung.';
  const data = value as Record<string, unknown>,
    parts: string[] = [];
  for (const [key, label] of Object.entries({
    name: 'Tên',
    reason: 'Lý do',
    note: 'Ghi chú',
    code: 'Mã đơn',
    previousCode: 'Mã đơn trước',
  }))
    if (typeof data[key] === 'string' && data[key])
      parts.push(label + ': ' + data[key]);
  for (const [key, label] of Object.entries({
    amount: 'Số tiền',
    total: 'Tổng tiền',
    openingCash: 'Tiền đầu ca',
    countedCash: 'Tiền thực đếm',
    expectedCash: 'Tiền dự kiến',
    difference: 'Chênh lệch',
    discountAmount: 'Tiền giảm',
  }))
    if (typeof data[key] === 'number' && Number.isSafeInteger(data[key]))
      parts.push(label + ': ' + formatVnd(data[key] as number));
  if (data.method)
    parts.push(
      'Phương thức: ' + (data.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'),
    );
  if (typeof data.count === 'number') parts.push('Số phần: ' + data.count);
  if (typeof data.isActive === 'boolean')
    parts.push(data.isActive ? 'Đang hoạt động' : 'Đã ngừng hoạt động');
  return parts.join(' · ') || 'Đã lưu thay đổi. Không có ghi chú bổ sung.';
}
