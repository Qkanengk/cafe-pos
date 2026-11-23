import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Tables } from '@/components/pos/tables';
export default async function Page() {
  const { storeId } = await requireUser();
  const tables = await db.table.findMany({
    where: { storeId },
    orderBy: [{ area: 'asc' }, { name: 'asc' }],
    include: {
      orders: {
        where: { status: 'OPEN' },
        select: { id: true, code: true, total: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  return <Tables tables={tables} />;
}
