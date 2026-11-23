'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatVnd, lineTotal } from '@/lib/money';
import type { SaleOrder } from '@/lib/sales-types';
import { PrintLinks } from './print-links';
import { OrderTools } from './order-tools';
import { Dialog } from '@/components/ui/dialog';
import { RefundControl } from './refund-control';
import { orderPaymentSummary } from '@/lib/order-payment-summary';
function SalePayments({ payments }: { payments: SaleOrder['payments'] }) {
  const summary = orderPaymentSummary(payments);
  return (
    <>
      <div>
        {summary.methods
          .map((method) => (method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'))
          .join(', ') || '—'}
      </div>
      {summary.refunded > 0 && (
        <p className="text-xs text-amber-800">
          Đã hoàn {formatVnd(summary.refunded)}
        </p>
      )}
    </>
  );
}
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
  const [selected, setSelected] = useState<string | null>(null);
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
    <div className="orders-workspace space-y-4">
      <header>
        <h1>Đơn hàng</h1>
        <p className="mt-1 text-xs text-stone-500">
          Chọn ca hoặc ngày tạo đơn để tìm hóa đơn cũ và in lại.
        </p>
      </header>
      {history && (
        <div className="history-filters flex flex-wrap gap-4">
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
      <div className="underline-tabs" aria-label="Lọc trạng thái">
        {Object.entries(labels).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={'min-h-10 px-2 text-sm font-medium'}
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
      <div className="table-scroll">
        <table className="data-table orders-table">
          <thead>
            <tr>
              {[
                'Mã đơn',
                'Thời gian',
                'Loại / Bàn',
                'Nhân viên',
                'Tổng cộng',
                'Phương thức',
                'Trạng thái',
                '',
              ].map((label, index) => (
                <th key={index} scope="col">
                  {label || <span className="sr-only">Thao tác</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr
                key={order.id}
                data-testid={'order-' + order.id}
                tabIndex={0}
                onClick={(event) => {
                  if (!(event.target as HTMLElement).closest('a,button,dialog'))
                    setSelected(order.id);
                }}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    event.preventDefault();
                    setSelected(order.id);
                  }
                }}
              >
                <td className="font-semibold">{order.code}</td>
                <td className="text-xs text-stone-500">
                  {new Date(order.createdAt).toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}
                </td>
                <td>
                  {order.type === 'TAKEAWAY' ? 'Mang đi' : order.table?.name}
                </td>
                <td>{order.creator.name}</td>
                <td className="text-right font-semibold whitespace-nowrap">
                  {formatVnd(order.total)}
                </td>
                <td>
                  <SalePayments payments={order.payments} />
                </td>
                <td>
                  <span
                    className={
                      'order-state state-' + order.status.toLowerCase()
                    }
                  >
                    {labels[order.status]}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="min-h-10 text-xs font-medium whitespace-nowrap text-emerald-800"
                    onClick={() => setSelected(order.id)}
                  >
                    Chi tiết đơn ·{' '}
                    {order.items.filter((i) => i.status === 'ACTIVE').length}{' '}
                    món
                  </button>
                  {selected === order.id && (
                    <Dialog
                      title={'Đơn ' + order.code}
                      className="order-drawer"
                      onClose={() => setSelected(null)}
                    >
                      <p className="mb-4 text-xs text-stone-500">
                        {order.creator.name} ·{' '}
                        {order.type === 'TAKEAWAY'
                          ? 'Mang đi'
                          : order.table?.name}{' '}
                        · v{order.version}
                      </p>
                      <div className="space-y-3 border-t border-stone-200 pt-3">
                        {order.items.map((i) => (
                          <div
                            key={i.id}
                            className={
                              i.status === 'VOIDED'
                                ? 'rounded-xl bg-red-50 p-3 text-red-800'
                                : 'border-b border-stone-200 py-3'
                            }
                          >
                            <p
                              className={
                                i.status === 'VOIDED' ? 'line-through' : ''
                              }
                            >
                              {i.quantity} × {i.nameSnapshot} ·{' '}
                              {formatVnd(
                                lineTotal({
                                  price: i.priceSnapshot,
                                  quantity: i.quantity,
                                  toppings: i.toppings.map(
                                    (t) => t.priceSnapshot,
                                  ),
                                  status: i.status,
                                }),
                              )}
                            </p>
                            {i.toppings.length > 0 && (
                              <p className="text-sm">
                                {i.toppings
                                  .map((t) => t.nameSnapshot)
                                  .join(', ')}
                              </p>
                            )}
                            {i.note && (
                              <p className="text-sm">Ghi chú: {i.note}</p>
                            )}
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
                      {order.status === 'PAID' ? (
                        <>
                          <PrintLinks id={order.id} />
                          <RefundControl
                            order={order}
                            onChange={(updated) =>
                              setOrders((current) =>
                                current.map((o) =>
                                  o.id === updated.id ? updated : o,
                                ),
                              )
                            }
                          />
                        </>
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
                                current.map((o) =>
                                  o.id === updated.id ? updated : o,
                                ),
                              );
                              window.location.reload();
                            }}
                          />
                          <PrintLinks id={order.id} barOnly />
                        </>
                      ) : order.items.some((i) => i.status === 'VOIDED') ? (
                        <PrintLinks id={order.id} barOnly />
                      ) : null}
                    </Dialog>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
