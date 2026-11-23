'use client';
import { useState } from 'react';
import { formatVnd } from '@/lib/money';
import type { SaleOrder, BankDetails } from '@/lib/sales-types';
import { PaymentDialog } from './payment';
import { PrintLinks } from './print-links';
import { Button } from '@/components/ui/button';
export function Orders({
  initial,
  bank,
}: {
  initial: SaleOrder[];
  bank: BankDetails;
}) {
  const [orders, setOrders] = useState(initial);
  const [payment, setPayment] = useState<SaleOrder | null>(null);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-800">
          Theo dõi & in lại
        </p>
        <h1 className="mt-2 text-3xl font-bold">Đơn hàng</h1>
        <p className="mt-2 text-stone-500">
          100 đơn gần nhất. Mở lại đơn chờ để tiếp tục thanh toán an toàn.
        </p>
      </header>
      {!orders.length && (
        <p className="rounded-xl bg-white p-8 text-stone-500">
          Chưa có đơn hàng.
        </p>
      )}
      <div className="space-y-4">
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-2xl border border-stone-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{order.code}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {new Date(order.createdAt).toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}{' '}
                  · {order.creator.name} ·{' '}
                  {order.type === 'TAKEAWAY' ? 'Mang đi' : order.table?.name}
                </p>
              </div>
              <div className="text-right">
                <strong className="text-xl">{formatVnd(order.total)}</strong>
                <p className="mt-1 text-sm text-emerald-800">
                  {order.status === 'PAID'
                    ? 'Đã thanh toán'
                    : order.status === 'OPEN'
                      ? 'Chờ thanh toán'
                      : 'Đã hủy'}
                </p>
              </div>
            </div>
            <p className="my-4 text-sm text-stone-500">
              {order.items
                .filter((item) => item.status === 'ACTIVE')
                .map((item) => item.quantity + ' × ' + item.nameSnapshot)
                .join(' · ')}
            </p>
            {order.status === 'PAID' ? (
              <PrintLinks id={order.id} />
            ) : order.status === 'OPEN' ? (
              <Button onClick={() => setPayment(order)}>
                Tiếp tục thanh toán
              </Button>
            ) : null}
          </article>
        ))}
      </div>
      {payment && (
        <PaymentDialog
          order={payment}
          bank={bank}
          onClose={() => setPayment(null)}
          onPaid={(paid) => {
            setOrders(orders.map((o) => (o.id === paid.id ? paid : o)));
            setPayment(null);
          }}
        />
      )}
    </div>
  );
}
