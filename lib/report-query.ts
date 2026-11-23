import { db } from './db';
import { buildReport, reportRange } from './reports';
export async function loadReport(storeId: string, from?: string, to?: string) {
  const range = reportRange(from, to);
  const inRange = await db.auditLog.findMany({
    where: {
      storeId,
      entity: 'orders',
      action: { in: ['VOID', 'CANCEL'] },
      createdAt: { gte: range.start, lt: range.end },
    },
  });
  const ids = [...new Set(inRange.map((a) => a.entityId))];
  const audits = ids.length
    ? await db.auditLog.findMany({
        where: {
          storeId,
          entity: 'orders',
          entityId: { in: ids },
          action: { in: ['VOID', 'CANCEL'] },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const orders = await db.order.findMany({
    where: {
      storeId,
      OR: [
        { status: 'PAID', paidAt: { gte: range.start, lt: range.end } },
        { id: { in: ids } },
      ],
    },
    include: {
      items: {
        include: { toppings: true, product: { select: { name: true } } },
      },
      payments: true,
      shift: { include: { opener: { select: { name: true } } } },
    },
  });
  const owners = await db.user.findMany({
    where: { storeId },
    select: { id: true, name: true },
  });
  return buildReport(orders, audits, owners, range);
}
