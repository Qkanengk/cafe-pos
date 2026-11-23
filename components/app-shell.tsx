import Link from 'next/link';
import { Coffee } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { navigation } from '@/lib/navigation';
import { db } from '@/lib/db';
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await db.store.findUniqueOrThrow({
    where: { id: user.storeId },
  });
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-5">
        <Link
          href="/pos"
          className="inline-flex items-center gap-2 text-xl font-bold text-emerald-900"
        >
          <Coffee size={24} aria-hidden="true" /> {store.name}
        </Link>
        <div className="flex items-center gap-5">
          <span className="text-sm">
            {user.name} · {user.role === 'OWNER' ? 'Chủ quán' : 'Thu ngân'}
          </span>
          <form method="post" action="/api/auth/logout">
            <button className="text-sm underline">Đăng xuất</button>
          </form>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 p-5 md:grid-cols-[200px_1fr]">
        <nav
          className="flex flex-wrap content-start gap-2 md:flex-col"
          aria-label="Điều hướng chính"
        >
          {navigation
            .filter((item) => !item.owner || user.role === 'OWNER')
            .map((item) => (
              <Link
                className="rounded-xl px-4 py-3 font-medium hover:bg-emerald-100"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
