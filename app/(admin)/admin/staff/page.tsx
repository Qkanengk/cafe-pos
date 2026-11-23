import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminWorkspace } from '@/components/admin/workspace';
export default async function Page() {
  const { storeId } = await requireUser('OWNER');
  const users = await db.user.findMany({
    where: { storeId },
    select: { id: true, name: true, role: true, email: true, isActive: true },
    orderBy: { name: 'asc' },
  });
  return <AdminWorkspace section="staff" initialData={{ users }} />;
}
