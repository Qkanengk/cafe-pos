import { Armchair } from 'lucide-react';
import { formatVnd, sumMoney } from '@/lib/money';
type Table = {
  id: string;
  name: string;
  area: string;
  orders: { id: string; code: string; total: number }[];
};
export function Tables({ tables }: { tables: Table[] }) {
  return (
    <div className="space-y-7">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
          Không gian quán
        </p>
        <h1 className="mt-2 text-3xl font-bold">Sơ đồ bàn</h1>
        <p className="mt-2 text-stone-500">
          Chạm bàn trống để nhận đơn, bàn đang phục vụ để tiếp tục.
        </p>
      </header>
      {[...new Set(tables.map((t) => t.area))].map((area) => (
        <section key={area}>
          <h2 className="mb-4 text-xl font-bold">{area}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {tables
              .filter((t) => t.area === area)
              .map((table) => (
                <article
                  key={table.id}
                  data-testid={'table-' + table.name}
                  className={
                    'rounded-2xl border p-4 ' +
                    (table.orders.length
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-stone-200 bg-white')
                  }
                >
                  <a
                    href={
                      table.orders.length
                        ? '/pos?orderId=' + table.orders[0].id
                        : '/pos?tableId=' + table.id
                    }
                    className="block space-y-3"
                  >
                    <Armchair size={32} aria-hidden="true" />
                    <h3 className="text-xl font-bold">{table.name}</h3>
                    <p className="text-sm">
                      {table.orders.length ? 'Đang phục vụ' : 'Trống'}
                    </p>
                    <strong className="block text-xl">
                      {formatVnd(sumMoney(table.orders.map((o) => o.total)))}
                    </strong>
                  </a>
                  {table.orders.length > 1 && (
                    <div className="mt-3 space-y-2 border-t border-emerald-200 pt-3">
                      {table.orders.map((o) => (
                        <a
                          key={o.id}
                          className="block min-h-11 text-sm font-semibold underline"
                          href={'/pos?orderId=' + o.id}
                        >
                          {o.code} · {formatVnd(o.total)}
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
          </div>
        </section>
      ))}
      {!tables.length && <p>Chưa có bàn.</p>}
    </div>
  );
}
