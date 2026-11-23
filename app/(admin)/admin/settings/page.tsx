import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminWorkspace } from '@/components/admin/workspace';
export default async function Page() {
  const { storeId } = await requireUser('OWNER');
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  return (
    <AdminWorkspace section="settings" initialData={{ settings: [store] }} />
  );
}
