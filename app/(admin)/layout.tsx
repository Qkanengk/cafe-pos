import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser('OWNER');
  return <AppShell>{children}</AppShell>;
}
