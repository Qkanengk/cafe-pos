import { db } from './db';
export function loadTables(storeId: string) {
  return db.table.findMany({
    where: { storeId },
    orderBy: [{ area: 'asc' }, { name: 'asc' }],
    include: {
      orders: {
        where: { status: 'OPEN' },
        select: { id: true, code: true, total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}
