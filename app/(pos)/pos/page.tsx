import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Terminal } from '@/components/pos/terminal';
export default async function Page() {
  const { storeId } = await requireUser();
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
      products={products}
      categories={categories}
      toppings={toppings}
      tables={tables}
      bank={store}
      hasShift={!!shift}
    />
  );
}
