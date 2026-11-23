import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Terminal } from '@/components/pos/terminal';
import { orderInclude } from '@/lib/sales';
import { OfflineWorkspace } from '@/components/pos/offline-workspace';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; tableId?: string }>;
}) {
  const { storeId } = await requireUser();
  const params = await searchParams;
  const initialOrder = params.orderId
    ? await db.order.findFirst({
        where: { id: params.orderId, storeId, status: 'OPEN' },
        include: orderInclude,
      })
    : null;
  if (params.orderId && !initialOrder) return <OfflineWorkspace />;
  const [products, categories, toppings, tables, store, shift] =
    await Promise.all([
      db.product.findMany({
        where: { storeId },
        include: { variants: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      db.category.findMany({
        where: { storeId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      db.topping.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      db.table.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      db.store.findUniqueOrThrow({ where: { id: storeId } }),
      db.shift.findFirst({ where: { storeId, closedAt: null } }),
    ]);
  return (
    <Terminal
      key={initialOrder?.id ?? params.tableId ?? 'new'}
      initialOrder={
        initialOrder ? JSON.parse(JSON.stringify(initialOrder)) : undefined
      }
      initialTableId={params.tableId}
      products={products}
      categories={categories}
      toppings={toppings}
      tables={tables}
      bank={store}
      hasShift={!!shift}
    />
  );
}
