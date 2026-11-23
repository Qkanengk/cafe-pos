import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppFrame } from './app-frame';
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await db.store.findUniqueOrThrow({
    where: { id: user.storeId },
  });
  return (
    <AppFrame
      storeName={store.name}
      user={{ name: user.name, role: user.role }}
    >
      {children}
    </AppFrame>
  );
}
