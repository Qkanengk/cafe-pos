import { z } from 'zod';
import { parseVndInput } from './money';
z.config(z.locales.vi());
export const cashValue = z.preprocess(
  (value) => (typeof value === 'string' ? parseVndInput(value) : value),
  z.number().int().min(0).max(2147483647),
);
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
          itemId: z.uuid().optional(),
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
  z.object({
    method: z.literal('CASH'),
    id: z.uuid().optional(),
    received: cashValue,
    version: z.number().int().positive().optional(),
  }),
  z.object({
    method: z.literal('BANK_TRANSFER'),
    id: z.uuid().optional(),
    confirmed: z.literal(true),
    version: z.number().int().positive().optional(),
  }),
]);
export const versionSchema = z.number().int().positive();
export const voidReasonPresets = [
  'Hết hàng',
  'Khách đổi ý',
  'Nhập nhầm món',
  'Chất lượng không đạt',
] as const;
export const editOrderSchema = z.object({
  version: versionSchema,
  order: checkoutSchema,
});
const authorization = {
  reason: z.string().trim().min(1, 'Vui lòng nhập lý do').max(300),
  ownerPin: z.string().regex(/^[0-9]{4,6}$/, 'PIN gồm 4–6 chữ số'),
};
export const operationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('VOID'),
    version: versionSchema,
    itemId: z.uuid(),
    ...authorization,
  }),
  z.object({
    action: z.literal('CANCEL'),
    version: versionSchema,
    ...authorization,
  }),
  z.object({
    action: z.literal('MOVE'),
    version: versionSchema,
    tableId: z.uuid(),
  }),
  z.object({
    action: z.literal('MERGE'),
    version: versionSchema,
    sourceId: z.uuid(),
    sourceVersion: versionSchema,
  }),
  z.object({
    action: z.literal('SPLIT'),
    version: versionSchema,
    newId: z.uuid(),
    items: z
      .array(
        z.object({
          itemId: z.uuid(),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(100),
  }),
]);
