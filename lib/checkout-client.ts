import { prepareLocal } from './offline';
import { posFetch } from './pos-fetch';
import type { z } from 'zod';
import type { checkoutSchema } from './sales-validation';
import type { SaleOrder } from './sales-types';
import { orderMatchesCheckout } from './order-match';
async function recoverOrQueue(input: z.infer<typeof checkoutSchema>) {
  let existing: SaleOrder | undefined;
  let unauthorized = false;
  try {
    const response = await fetch('/api/orders/' + input.id, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) existing = await response.json();
    else unauthorized = response.status === 401 || response.status === 403;
  } catch {}
  if (unauthorized)
    throw new Error('Cần đăng nhập lại để kiểm tra đơn trên máy chủ.');
  if (existing) {
    if (
      existing.status === 'CANCELLED' ||
      !orderMatchesCheckout(existing, input)
    )
      throw new Error(
        'Đơn đã có trên máy chủ với nội dung khác. Mở Đơn hàng để kiểm tra trước khi nhận tiền; giỏ vẫn được giữ.',
      );
    return existing;
  }
  return prepareLocal(input);
}
export async function checkoutWithFallback(
  input: z.infer<typeof checkoutSchema>,
  prepared: SaleOrder | null,
) {
  let response: Response;
  try {
    response = await posFetch(
      prepared ? '/api/orders/' + input.id : '/api/orders',
      {
        method: prepared ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          prepared ? { version: prepared.version, order: input } : input,
        ),
      },
    );
  } catch (error) {
    if (
      !(error instanceof TypeError) &&
      !(error instanceof DOMException && error.name === 'AbortError')
    )
      throw error;
    if (prepared)
      throw new Error(
        'Mất kết nối máy chủ. Đơn đã giữ vẫn còn; hãy kết nối và thử lại cùng mã đơn.',
      );
    return recoverOrQueue(input);
  }
  if (response.status >= 500) {
    if (prepared)
      throw new Error(
        'Máy chủ tạm lỗi. Đơn đã giữ vẫn còn; hãy thử lại cùng mã đơn.',
      );
    return recoverOrQueue(input);
  }
  const order = await response.json();
  if (!response.ok) throw new Error(order.error ?? 'Không thể lưu đơn');
  return order as SaleOrder;
}
