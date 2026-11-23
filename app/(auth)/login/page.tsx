import { db } from '@/lib/db';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  const store = await db.store.findFirst({ select: { name: true } });
  const users = await db.user.findMany({
    where: { isActive: true, role: 'CASHIER' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return (
    <main className="login-page">
      <div className="login-card">
        <p className="mb-2 text-xs font-medium text-stone-500">
          {store?.name ?? 'Cafe POS'}
        </p>
        <h1 className="mb-5 text-xl font-semibold">Đăng nhập</h1>
        <LoginForm users={users} />
      </div>
    </main>
  );
}
