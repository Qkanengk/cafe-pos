'use client';
import { usePathname } from 'next/navigation';
import {
  Store,
  ShoppingBasket,
  Armchair,
  ReceiptText,
  Clock3,
  UtensilsCrossed,
  Users,
  ChartNoAxesCombined,
  Settings,
  NotebookText,
  LogOut,
} from 'lucide-react';
import { navigation } from '@/lib/navigation';
import { OfflineStatus } from './offline-status';
const icons = [
  ShoppingBasket,
  Armchair,
  ReceiptText,
  Clock3,
  UtensilsCrossed,
  Users,
  Settings,
  ChartNoAxesCombined,
  NotebookText,
];
export function AppFrame({
  children,
  storeName,
  user,
}: {
  children: React.ReactNode;
  storeName: string;
  user: { name: string; role: string };
}) {
  const path = usePathname();
  return (
    <div
      className="app-frame"
      data-page={path.split('/').filter(Boolean)[0] ?? 'pos'}
    >
      <aside className="app-rail">
        <a
          href="/pos"
          className="rail-brand"
          aria-label={storeName}
          title={storeName}
        >
          <Store size={24} aria-hidden="true" />
          <span>{storeName}</span>
        </a>
        <nav aria-label="Điều hướng chính">
          {navigation.map((item, index) => {
            const Icon = icons[index];
            return !item.owner || user.role === 'OWNER' ? (
              <a
                key={item.href}
                href={item.href}
                aria-current={path === item.href ? 'page' : undefined}
                title={item.label}
              >
                <Icon size={21} aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            ) : null;
          })}
        </nav>
        <div className="rail-user">
          <span title={user.name}>{user.name}</span>
          <small>{user.role === 'OWNER' ? 'Chủ quán' : 'Thu ngân'}</small>
          <form method="post" action="/api/auth/logout">
            <button aria-label="Đăng xuất" title="Đăng xuất">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </aside>
      <div className="app-workarea">
        <header className="app-toolbar">
          <span className="toolbar-location">
            {storeName}
            <span aria-hidden="true"> / </span>
            <strong>
              {navigation.find((item) => item.href === path)?.label ??
                'Bán hàng'}
            </strong>
          </span>
          <OfflineStatus />
        </header>
        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}
