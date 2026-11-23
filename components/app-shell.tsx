import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { navigation } from '@/lib/navigation';
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-5">
        <Link href="/pos" className="text-xl font-bold text-emerald-900">
          ☕ Cafe Demo
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
        <main>{children}</main>
      </div>
    </div>
  );
}
