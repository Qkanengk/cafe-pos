import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminWorkspace } from '@/components/admin/workspace';
export default async function Page() {
  const { storeId } = await requireUser('OWNER');
  const [categories, products, toppings] = await Promise.all([
    db.category.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.product.findMany({
      where: { storeId },
      include: {
        variants: { where: { isActive: true } },
        toppings: { select: { id: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.topping.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
  ]);
  return (
    <AdminWorkspace
      section="menu"
      initialData={{ categories, products, toppings }}
    />
  );
}
