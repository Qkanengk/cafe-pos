import { requireUser } from '@/lib/auth';
import { listShifts } from '@/lib/sales';
import { Shifts } from '@/components/pos/shifts';
export default async function Page() {
  const user = await requireUser();
  const shifts = await listShifts(user.storeId);
  return <Shifts initial={JSON.parse(JSON.stringify(shifts))} />;
}
