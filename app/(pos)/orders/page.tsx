import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { orderInclude } from '@/lib/sales';
import { Orders } from '@/components/pos/orders';
import { LocalHeldOrders } from '@/components/pos/local-held-orders';
import { orderHistoryWhere } from '@/lib/order-history';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ shiftId?: string; date?: string }>;
}) {
  const { storeId } = await requireUser();
  const filters = await searchParams;
  const shift = await db.shift.findFirst({
    where: { storeId, closedAt: null },
  });
  let where;
  try {
    where = orderHistoryWhere(storeId, shift?.id, filters);
  } catch {
    return (
      <p role="alert">
        Bộ lọc không hợp lệ. <a href="/orders">Trở lại đơn trong ca hiện tại</a>
      </p>
    );
  }
  const [orders, tables, shifts] = await Promise.all([
    db.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.table.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, area: true },
    }),
    db.shift.findMany({
      where: { storeId },
      select: { id: true, openedAt: true, closedAt: true },
      orderBy: { openedAt: 'desc' },
      take: 100,
    }),
  ]);
  return (
    <div className="space-y-6">
      <LocalHeldOrders />
      <Orders
        initial={JSON.parse(JSON.stringify(orders))}
        tables={tables}
        history={{ ...filters, shifts: JSON.parse(JSON.stringify(shifts)) }}
      />
    </div>
  );
}
