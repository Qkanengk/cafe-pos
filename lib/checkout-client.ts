import { prepareLocal } from './offline';
import { posFetch } from './pos-fetch';
import type { z } from 'zod';
import type { checkoutSchema } from './sales-validation';
import type { SaleOrder } from './sales-types';
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
    return prepareLocal(input);
  }
  if (response.status >= 500) {
    if (prepared)
      throw new Error(
        'Máy chủ tạm lỗi. Đơn đã giữ vẫn còn; hãy thử lại cùng mã đơn.',
      );
    return prepareLocal(input);
  }
  const order = await response.json();
  if (!response.ok) throw new Error(order.error ?? 'Không thể lưu đơn');
  return order as SaleOrder;
}
