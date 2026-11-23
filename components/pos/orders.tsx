'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatVnd, lineTotal } from '@/lib/money';
import type { SaleOrder } from '@/lib/sales-types';
import { PrintLinks } from './print-links';
import { OrderTools } from './order-tools';
export function Orders({
  initial,
  tables,
  history,
}: {
  initial: SaleOrder[];
  tables: { id: string; name: string; area: string }[];
  history?: {
    shiftId?: string;
    date?: string;
    shifts: { id: string; openedAt: string; closedAt: string | null }[];
  };
}) {
  const [orders, setOrders] = useState(initial);
  const [status, setStatus] = useState('ALL');
  const labels = {
    ALL: 'Tất cả',
    OPEN: 'Đang giữ',
    PAID: 'Đã thanh toán',
    CANCELLED: 'Đã hủy / đã gộp',
  };
  const filtered = orders.filter(
    (o) => status === 'ALL' || o.status === status,
  );
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
          Theo dõi & in lại
        </p>
        <h1 className="mt-2 text-3xl font-bold">Đơn hàng</h1>
        <p className="mt-2 text-stone-500">
          Chọn ca hoặc ngày tạo đơn để tìm hóa đơn cũ và in lại.
        </p>
      </header>
      {history && (
        <div className="flex flex-wrap gap-4">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="grid gap-2">
              Ca làm việc
              <select
                aria-label="Lọc theo ca"
                name="shiftId"
                defaultValue={history.shiftId ?? 'current'}
                className="min-h-12 rounded-xl border bg-white p-3"
              >
                <option value="current">Ca đang mở</option>
                {history.shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.openedAt).toLocaleString('vi-VN', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                    })}{' '}
                    · {s.closedAt ? 'Đã đóng' : 'Đang mở'}
                  </option>
                ))}
              </select>
            </label>
            <button className="min-h-12 rounded-xl border px-4">Xem ca</button>
          </form>
          <form method="get" className="flex items-end gap-2">
            <label className="grid gap-2">
              Ngày tạo đơn
              <input
                aria-label="Lọc theo ngày"
                className="min-h-12 rounded-xl border bg-white p-3"
                type="date"
                name="date"
                defaultValue={history.date}
                required
              />
            </label>
            <button className="min-h-12 rounded-xl border px-4">
              Xem ngày
            </button>
          </form>
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Lọc trạng thái">
        {Object.entries(labels).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={
              'min-h-12 rounded-xl px-4 font-semibold ' +
              (status === value
                ? 'bg-emerald-800 text-white'
                : 'border border-stone-200 bg-white')
            }
          >
            {label}
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p className="rounded-xl bg-white p-8 text-stone-500">
          Không có đơn trong trạng thái này hoặc chưa mở ca.
        </p>
      )}
      <div className="space-y-4">
        {filtered.map((order) => (
          <article
            key={order.id}
            data-testid={'order-' + order.id}
            className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{order.code}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {new Date(order.createdAt).toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}{' '}
                  · {order.creator.name} ·{' '}
                  {order.type === 'TAKEAWAY' ? 'Mang đi' : order.table?.name} ·
                  v{order.version}
                </p>
              </div>
              <div className="text-right">
                <strong className="text-xl">{formatVnd(order.total)}</strong>
                <p className="mt-1 text-sm text-emerald-800">
                  {labels[order.status]}
                </p>
              </div>
            </div>
            <details>
              <summary className="min-h-11 cursor-pointer font-semibold text-emerald-800">
                Chi tiết đơn ·{' '}
                {order.items.filter((i) => i.status === 'ACTIVE').length} món
              </summary>
              <div className="space-y-3 border-t border-stone-100 pt-3">
                {order.items.map((i) => (
                  <div
                    key={i.id}
                    className={
                      i.status === 'VOIDED'
                        ? 'rounded-xl bg-red-50 p-3 text-red-800'
                        : 'rounded-xl bg-stone-50 p-3'
                    }
                  >
                    <p className={i.status === 'VOIDED' ? 'line-through' : ''}>
                      {i.quantity} × {i.nameSnapshot} ·{' '}
                      {formatVnd(
                        lineTotal({
                          price: i.priceSnapshot,
                          quantity: i.quantity,
                          toppings: i.toppings.map((t) => t.priceSnapshot),
                          status: i.status,
                        }),
                      )}
                    </p>
                    {i.toppings.length > 0 && (
                      <p className="text-sm">
                        {i.toppings.map((t) => t.nameSnapshot).join(', ')}
                      </p>
                    )}
                    {i.note && <p className="text-sm">Ghi chú: {i.note}</p>}
                    {i.status === 'VOIDED' && (
                      <p className="text-sm font-semibold">
                        Đã hủy · {i.voidReason}
                      </p>
                    )}
                  </div>
                ))}
                <p className="text-sm">
                  Tạm tính {formatVnd(order.subtotal)} · Tổng cộng{' '}
                  {formatVnd(order.total)}
                </p>
                {order.note && <p>{order.note}</p>}
              </div>
            </details>
            {order.status === 'PAID' ? (
              <PrintLinks id={order.id} />
            ) : order.status === 'OPEN' ? (
              <>
                <Link
                  className="inline-flex min-h-12 items-center rounded-xl bg-emerald-800 px-5 font-semibold text-white"
                  href={'/pos?orderId=' + order.id}
                >
                  Mở / tiếp tục đơn
                </Link>
                <OrderTools
                  order={order}
                  tables={tables}
                  onChange={(updated) => {
                    setOrders((current) =>
                      current.map((o) => (o.id === updated.id ? updated : o)),
                    );
                    window.location.reload();
                  }}
                />
              </>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
