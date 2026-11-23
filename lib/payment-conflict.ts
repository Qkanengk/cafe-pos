import type { SaleOrder } from './sales-types';
export class PaymentConflictError extends Error {
  constructor(public order: SaleOrder) {
    super(
      'Đơn đã được thanh toán. Không nhận thêm tiền hoặc trả tiền thừa dự kiến.',
    );
  }
}
