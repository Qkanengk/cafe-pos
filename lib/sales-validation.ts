import { z } from 'zod';
z.config(z.locales.vi());
export const cashValue = z.number().int().min(0).max(2147483647);
export const openShiftSchema = z.object({ openingCash: cashValue });
export const closeShiftSchema = z.object({
  id: z.uuid(),
  countedCash: cashValue,
  note: z.string().trim().max(500).default(''),
});
export const checkoutSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['TAKEAWAY', 'DINE_IN']),
    tableId: z.uuid().optional(),
    note: z.string().trim().max(500).default(''),
    discount: z
      .object({ type: z.enum(['PERCENT', 'AMOUNT']), value: cashValue })
      .refine(
        (d) => d.type !== 'PERCENT' || d.value <= 100,
        'Phần trăm giảm giá tối đa 100',
      )
      .optional(),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          quantity: z.number().int().min(1).max(99),
          toppingIds: z
            .array(z.uuid())
            .max(20)
            .default([])
            .transform((ids) => [...new Set(ids)].sort()),
          note: z.string().trim().max(300).default(''),
        }),
      )
      .min(1, 'Giỏ hàng đang trống')
      .max(100),
  })
  .refine(
    (order) => order.type !== 'DINE_IN' || !!order.tableId,
    'Vui lòng chọn bàn',
  );
export const paymentSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('CASH'), received: cashValue }),
  z.object({ method: z.literal('BANK_TRANSFER'), confirmed: z.literal(true) }),
]);
