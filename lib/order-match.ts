import type { z } from 'zod';
import type { checkoutSchema } from './sales-validation';
import type { SaleOrder } from './sales-types';
type Input = z.infer<typeof checkoutSchema>;
export function orderMatchesCheckout(order: SaleOrder, input: Input) {
  const line = (
    variantId: string,
    quantity: number,
    note: string,
    toppingIds: string[],
  ) => JSON.stringify([variantId, quantity, note, [...toppingIds].sort()]);
  return (
    order.type === input.type &&
    (order.tableId ?? null) ===
      (input.type === 'DINE_IN' ? input.tableId : null) &&
    (order.note ?? '') === input.note &&
    (order.discountType ?? null) === (input.discount?.type ?? null) &&
    order.discountValue === (input.discount?.value ?? 0) &&
    JSON.stringify(
      order.items
        .filter((item) => item.status === 'ACTIVE')
        .map((item) =>
          line(
            item.variantId,
            item.quantity,
            item.note,
            item.toppings.map((t) => t.toppingId),
          ),
        )
        .sort(),
    ) ===
      JSON.stringify(
        input.lines
          .map((item) =>
            line(item.variantId, item.quantity, item.note, item.toppingIds),
          )
          .sort(),
      )
  );
}
