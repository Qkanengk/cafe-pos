import { db } from '@/lib/db';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  const store = await db.store.findFirst({ select: { name: true } });
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="mb-8 text-sm font-bold uppercase tracking-widest text-emerald-800">
          {store?.name ?? 'Cafe POS'} / Quầy bán hàng
        </p>
        <h1 className="text-3xl font-bold">Chào ngày mới ☕</h1>
        <p className="mt-3 mb-8 text-stone-500">
          Đăng nhập để bắt đầu ca làm việc.
        </p>
        <LoginForm users={users} />
      </div>
    </main>
  );
}
