import { z } from 'zod';
import { checkoutSchema, paymentSchema } from './sales-validation';
export const syncEntrySchema = z
  .object({
    order: checkoutSchema,
    userId: z.uuid(),
    shiftId: z.uuid(),
    paymentId: z.uuid(),
    createdAt: z.iso.datetime(),
    paidAt: z.iso.datetime(),
    catalogToken: z.string().min(1).max(200000),
    payment: paymentSchema,
  })
  .refine(
    (v) => !v.order.lines.some((l) => l.itemId),
    'Chỉ đồng bộ đơn mới tạo trên thiết bị',
  );
export const syncSchema = z.object({
  entries: z.array(syncEntrySchema).min(1).max(50),
});
export type SyncEntry = z.infer<typeof syncEntrySchema>;
