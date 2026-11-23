import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { orderInclude } from '@/lib/sales';
import { Orders } from '@/components/pos/orders';
export default async function Page() {
  const { storeId } = await requireUser();
  const [orders, store] = await Promise.all([
    db.order.findMany({
      where: { storeId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.store.findUniqueOrThrow({ where: { id: storeId } }),
  ]);
  return <Orders initial={JSON.parse(JSON.stringify(orders))} bank={store} />;
}
