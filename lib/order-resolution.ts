import { z } from 'zod';
import { db } from './db';
import { orderInclude } from './sales';
export async function loadOrderResolution(storeId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const order = await db.order.findFirst({
    where: { id, storeId },
    include: orderInclude,
  });
  if (!order) return null;
  let target: { id: string; code: string } | null = null;
  if (order.status === 'CANCELLED') {
    const merged = await db.auditLog.findFirst({
      where: { storeId, entity: 'orders', entityId: id, action: 'MERGED_INTO' },
      orderBy: { createdAt: 'desc' },
      select: { data: true },
    });
    const data = merged?.data;
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      z.uuid().safeParse(data.targetId).success
    )
      target = await db.order.findFirst({
        where: { id: data.targetId as string, storeId },
        select: { id: true, code: true },
      });
  }
  return { order, target };
}
