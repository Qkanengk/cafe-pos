import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Terminal } from '@/components/pos/terminal';
import { loadOrderResolution } from '@/lib/order-resolution';
import { PrintLinks } from '@/components/pos/print-links';
import { formatVnd } from '@/lib/money';
import { OfflineWorkspace } from '@/components/pos/offline-workspace';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; tableId?: string }>;
}) {
  const { storeId, id: actorId } = await requireUser();
  const params = await searchParams;
  const resolution = params.orderId
    ? await loadOrderResolution(storeId, params.orderId)
    : null;
  const initialOrder = resolution?.order;
  if (params.orderId && !initialOrder) return <OfflineWorkspace />;
  if (initialOrder && initialOrder.status !== 'OPEN')
    return (
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h1 className="text-2xl font-bold">{initialOrder.code}</h1>
        {initialOrder.status === 'PAID' ? (
          <>
            <p role="status">
              Đơn đã được thanh toán · {formatVnd(initialOrder.total)}. Không
              nhận thêm tiền cho đơn này.
            </p>
            <PrintLinks id={initialOrder.id} />
          </>
        ) : resolution?.target ? (
          <>
            <p>Đơn đã gộp vào {resolution.target.code}.</p>
            <a
              className="block underline"
              href={'/pos?orderId=' + resolution.target.id}
            >
              Mở đơn đích {resolution.target.code}
            </a>
          </>
        ) : (
          <p>Đơn đã hủy. Bàn không còn giữ bởi đơn này.</p>
        )}
        <a className="block underline" href="/tables">
          Về sơ đồ bàn
        </a>
        <a className="block underline" href="/orders">
          Tìm hóa đơn khác
        </a>
      </section>
    );
  const [products, categories, toppings, tables, store, shift] =
    await Promise.all([
      db.product.findMany({
        where: { storeId, category: { isActive: true } },
        include: {
          variants: { where: { isActive: true } },
          toppings: { select: { id: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      db.category.findMany({
        where: { storeId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      db.topping.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      db.table.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      db.store.findUniqueOrThrow({ where: { id: storeId } }),
      db.shift.findFirst({ where: { storeId, closedAt: null } }),
    ]);
  return (
    <Terminal
      actorId={actorId}
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
