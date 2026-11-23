'use client';
import { useEffect, useState } from 'react';
import { localDrafts } from '@/lib/offline';
import type { LocalDraft } from '@/lib/offline-types';
import { formatVnd } from '@/lib/money';
export function LocalHeldOrders() {
  const [drafts, setDrafts] = useState<LocalDraft[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => {
      void localDrafts()
        .then((rows) => {
          if (active) {
            setDrafts(rows);
            setError('');
          }
        })
        .catch((e) => {
          if (active)
            setError(
              e instanceof Error ? e.message : 'Không thể mở đơn trên thiết bị',
            );
        });
    };
    load();
    window.addEventListener('cafe-offline-change', load);
    return () => {
      active = false;
      window.removeEventListener('cafe-offline-change', load);
    };
  }, []);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Đơn giữ trên thiết bị</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : drafts.length === 0 ? (
        <p>Chưa có đơn giữ ngoại tuyến trên thiết bị này.</p>
      ) : (
        drafts.map(({ order }) => (
          <a
            key={order.id}
            className="block rounded-xl border bg-white p-4"
            href={'/pos?orderId=' + order.id}
          >
            <strong>
              {order.code} · {formatVnd(order.total)}
            </strong>
            <p>{order.table?.name ?? 'Mang đi'} · Mở / tiếp tục đơn</p>
          </a>
        ))
      )}
    </section>
  );
}
