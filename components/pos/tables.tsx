'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { posFetch } from '@/lib/pos-fetch';
import { serialPoll } from '@/lib/live-state';
import { formatVnd, sumMoney } from '@/lib/money';
type Table = {
  id: string;
  name: string;
  area: string;
  orders: { id: string; code: string; total: number; createdAt?: string | Date }[];
};
const subscribeToHydration = () => () => {};
export function Tables({
  tables: initial,
  offline = false,
}: {
  tables: Table[];
  offline?: boolean;
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [tables, setTables] = useState(initial),
    [error, setError] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  useEffect(() => {
    if (offline) return;
    let active = true;
    const update = serialPoll(async () => {
      if (document.hidden) return;
      try {
        const response = await posFetch('/api/tables', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) {
          setTables(data);
          setError('');
        }
      } catch {
        if (active)
          setError(
            'Chưa cập nhật được bàn. Dữ liệu có thể cũ; hãy kiểm tra kết nối.',
          );
      }
    });
    void update();
    const timer = setInterval(() => void update(), 5000);
    window.addEventListener('focus', update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [offline]);
  return (
    <div className="floor-workspace">
      <header>
        <h1>Sơ đồ bàn</h1>
        <p className="mt-1 text-xs text-stone-500">
          {tables.filter((t) => t.orders.length).length} đang phục vụ ·{' '}
          {tables.filter((t) => !t.orders.length).length} trống
        </p>
      </header>
      <p className="text-xs text-stone-500">
        {offline
          ? 'Sơ đồ đã lưu, chưa phản ánh thay đổi trên máy chủ.'
          : 'Tự kiểm tra bàn mỗi 5 giây; thay đổi từ thiết bị khác sẽ hiện tại đây.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <nav className="underline-tabs" aria-label="Khu vực bàn">
        {['', ...new Set(tables.map((t) => t.area))].map((area) => (
          <button
            type="button"
            key={area}
            aria-pressed={selectedArea === area}
            onClick={() => setSelectedArea(area)}
          >
            {area || 'Tất cả khu vực'}
          </button>
        ))}
      </nav>
      <div className="floor-areas">
        {[...new Set(tables.map((t) => t.area))]
          .filter((area) => !selectedArea || area === selectedArea)
          .map((area) => (
            <section key={area}>
              <h2 className="mb-3 text-sm font-semibold text-stone-600">
                {area}
              </h2>
              <div className="floor-grid">
                {tables
                  .filter((t) => t.area === area)
                  .map((table) => (
                    <article
                      key={table.id}
                      data-testid={'table-' + table.name}
                      className="table-tile"
                      data-occupied={!!table.orders.length}
                    >
                      <a
                        href={
                          table.orders.length
                            ? '/pos?orderId=' + table.orders[0].id
                            : '/pos?tableId=' + table.id
                        }
                        className="table-tile-body"
                      >
                        <h3 className="text-xl font-semibold">{table.name}</h3>
                        <p className="text-xs text-stone-500">
                          {table.orders.length ? (
                            <>
                              Đang phục vụ
                              {hydrated &&
                                table.orders[0].createdAt &&
                                ' · ' +
                                  Math.max(
                                    0,
                                    Math.floor(
                                      (Date.now() -
                                        new Date(
                                          table.orders[0].createdAt,
                                        ).getTime()) /
                                        60000,
                                    ),
                                  ) +
                                  ' phút'}
                            </>
                          ) : (
                            'Trống'
                          )}
                        </p>
                        <strong className="mt-auto block text-lg font-semibold">
                          {formatVnd(
                            sumMoney(table.orders.map((o) => o.total)),
                          )}
                        </strong>
                      </a>
                      {table.orders.length > 1 && (
                        <div className="table-extra-orders">
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
      </div>
      {!tables.length && <p>Chưa có bàn.</p>}
    </div>
  );
}
