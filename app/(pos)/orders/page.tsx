import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { orderInclude } from '@/lib/sales';
import { Orders } from '@/components/pos/orders';
import { LocalHeldOrders } from '@/components/pos/local-held-orders';
export default async function Page() {
  const { storeId } = await requireUser();
  const shift = await db.shift.findFirst({
    where: { storeId, closedAt: null },
  });
  const [orders, tables] = await Promise.all([
    db.order.findMany({
      where: { storeId, shiftId: shift?.id ?? 'none' },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.table.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, area: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <LocalHeldOrders />
      <Orders initial={JSON.parse(JSON.stringify(orders))} tables={tables} />
    </div>
  );
}
