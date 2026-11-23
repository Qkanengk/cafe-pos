import type { Prisma } from '@prisma/client';
export async function auditDiscount(
  tx: Prisma.TransactionClient,
  actor: { id: string; storeId: string },
  order: {
    id: string;
    subtotal: number;
    total: number;
    discountType: string | null;
    discountValue: number;
  },
) {
  if (
    order.subtotal <= order.total ||
    !order.discountType ||
    !(order.discountValue > 0)
  )
    return;
  await tx.auditLog.create({
    data: {
      storeId: actor.storeId,
      userId: actor.id,
      entity: 'orders',
      entityId: order.id,
      action: 'DISCOUNT',
      data: {
        type: order.discountType,
        value: order.discountValue,
        subtotal: order.subtotal,
        amount: order.subtotal - order.total,
        total: order.total,
      },
    },
  });
}
