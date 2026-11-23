import { z } from 'zod';
import type { SaleOrder } from './sales-types';
import type { WorkingLine } from './order-recovery';
const money = z.number().int().min(0).max(2147483647);
const topping = z.object({
  id: z.string(),
  toppingId: z.string(),
  nameSnapshot: z.string(),
  priceSnapshot: money,
});
const item = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  nameSnapshot: z.string(),
  priceSnapshot: money,
  quantity: z.number().int().min(1).max(99),
  note: z.string(),
  status: z.enum(['ACTIVE', 'VOIDED']),
  voidReason: z.string().nullable().optional(),
  toppings: z.array(topping),
});
const order = z.object({
  id: z.uuid(),
  code: z.string(),
  version: z.number().int().positive(),
  tableId: z.string().nullable(),
  type: z.enum(['TAKEAWAY', 'DINE_IN']),
  status: z.enum(['OPEN', 'PAID', 'CANCELLED']),
  subtotal: money,
  discountType: z.enum(['PERCENT', 'AMOUNT']).nullable(),
  discountValue: money,
  total: money,
  note: z.string().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  createdBy: z.string(),
  creator: z.object({ name: z.string() }),
  table: z.object({ name: z.string(), area: z.string() }).nullable(),
  items: z.array(item),
  payments: z.array(
    z.object({
      id: z.string(),
      method: z.enum(['CASH', 'BANK_TRANSFER']),
      amount: money,
      received: money.nullable(),
      change: money.nullable(),
      confirmedBy: z.string().nullable(),
    }),
  ),
});
const line = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  quantity: z.number().int().min(1).max(99),
  toppingIds: z.array(z.string()),
  note: z.string(),
  snapshot: item.optional(),
});
const schema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    paymentId: z.uuid(),
    lines: z.array(line).max(100),
    type: z.enum(['TAKEAWAY', 'DINE_IN']),
    tableId: z.string(),
    discountType: z.enum(['PERCENT', 'AMOUNT']),
    discountValue: z.string(),
    prepared: order.nullable(),
  })
  .refine((cart) => !cart.prepared || cart.prepared.id === cart.id);
export type WorkingCart = {
  version: 1;
  id: string;
  paymentId: string;
  lines: WorkingLine[];
  type: 'TAKEAWAY' | 'DINE_IN';
  tableId: string;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: string;
  prepared: SaleOrder | null;
};
const prefix = (userId: string) => 'cafe-pos-working:' + userId + ':';
export function tabPaymentId(
  userId: string,
  orderId: string,
  fallback: string,
) {
  try {
    const key = prefix(userId) + 'payment:' + orderId;
    const saved = sessionStorage.getItem(key);
    if (saved && z.uuid().safeParse(saved).success) return saved;
    sessionStorage.setItem(key, fallback);
  } catch {}
  return fallback;
}
const recordKey = (userId: string, id: string) =>
  prefix(userId) + 'order:' + id;
const pointerKey = (userId: string, scope: string) =>
  prefix(userId) + 'active:' + scope;
export function readWorkingCart(
  userId: string,
  scope: string,
): WorkingCart | null {
  const id = localStorage.getItem(pointerKey(userId, scope)) ?? scope;
  const raw = localStorage.getItem(recordKey(userId, id));
  if (!raw) return null;
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success || parsed.data.id !== id)
    throw new Error(
      'Bản giỏ đã lưu không hợp lệ. Không ghi đè; hãy kiểm tra hoặc chủ động bỏ bản lưu.',
    );
  return parsed.data;
}
export function saveWorkingCart(
  userId: string,
  scope: string,
  cart: WorkingCart,
) {
  const data = schema.parse(cart);
  localStorage.setItem(recordKey(userId, cart.id), JSON.stringify(data));
  if (
    cart.prepared &&
    localStorage.getItem(pointerKey(userId, 'new')) === cart.id
  )
    localStorage.removeItem(pointerKey(userId, 'new'));
  localStorage.setItem(
    pointerKey(userId, cart.prepared ? cart.id : scope),
    cart.id,
  );
}
export function clearWorkingCart(userId: string, scope: string, id?: string) {
  const savedId =
    id ?? localStorage.getItem(pointerKey(userId, scope)) ?? scope;
  localStorage.removeItem(recordKey(userId, savedId));
  const keys = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i),
  ).filter(
    (key): key is string => !!key && key.startsWith(prefix(userId) + 'active:'),
  );
  for (const key of keys)
    if (localStorage.getItem(key) === savedId) localStorage.removeItem(key);
  if (!id) localStorage.removeItem(pointerKey(userId, scope));
}
