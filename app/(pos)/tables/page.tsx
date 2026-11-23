import { requireUser } from '@/lib/auth';
import { loadTables } from '@/lib/table-data';
import { Tables } from '@/components/pos/tables';
export default async function Page() {
  const { storeId } = await requireUser();
  const tables = await loadTables(storeId);
  return <Tables tables={tables} />;
}
