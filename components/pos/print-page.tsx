import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { orderInclude } from '@/lib/sales';
import { formatVnd, lineTotal, discountAmount } from '@/lib/money';
import { PrintButton } from './print-button';
import { printStatuses, ticketItems } from '@/lib/printing';
export async function PrintPage({
  id,
  bar = false,
}: {
  id?: string;
  bar?: boolean;
}) {
  const user = await requireUser();
  if (!id) notFound();
  const order = await db.order.findFirst({
    where: { id, storeId: user.storeId, status: { in: printStatuses(bar) } },
    include: orderInclude,
  });
  if (!order) notFound();
  const store = await db.store.findUniqueOrThrow({
    where: { id: user.storeId },
  });
  const width = store.receiptWidth === 58 ? 58 : 80;
  const payment = order.payments[0];
  const confirmer = payment?.confirmedBy
    ? await db.user.findFirst({
        where: { id: payment.confirmedBy, storeId: user.storeId },
        select: { name: true },
      })
    : null;
  return (
    <main className="print-surface min-h-screen py-8">
      <style>{`
 .paper { width: ${width}mm; padding: 4mm; margin: 0 auto; background: white; color: black; font-family: Arial, sans-serif; font-size: 11px; overflow-wrap: anywhere; }
 @page { size: ${width}mm 297mm; margin: 0; }
 @media print { html,body { margin:0!important; padding:0!important; background:white!important; } .print-toolbar { display:none!important; } .print-surface { padding:0!important; min-height:0!important; } .paper { margin:0!important; box-shadow:none!important; } .receipt-line { break-inside:avoid; } }
 `}</style>
      <div className="print-toolbar mx-auto mb-6 flex max-w-md items-center justify-center gap-5 px-4">
        <Link
          href="/orders"
          className="font-semibold text-emerald-800 underline"
        >
          Về đơn hàng
        </Link>
        <PrintButton />
      </div>
      <article
        className="paper shadow-lg"
        data-testid={bar ? 'bar-ticket' : 'receipt'}
      >
        <header className="border-b border-dashed border-black pb-3 text-center">
          <h1 className="text-lg font-bold">{store.name}</h1>
          {!bar && store.address && <p>{store.address}</p>}
          <h2 className="mt-2 text-sm font-bold">
            {bar ? 'PHIẾU PHA CHẾ' : 'HÓA ĐƠN BÁN HÀNG'}
          </h2>
          <p className="mt-1 font-bold">{order.code}</p>
          <p>
            {new Intl.DateTimeFormat('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(order.paidAt ?? order.createdAt)}
          </p>
          <p>
            {order.type === 'TAKEAWAY'
              ? 'Mang đi'
              : 'Tại bàn · ' + order.table?.name}
          </p>
          <p>Thu ngân: {order.creator.name}</p>
          {bar && (
            <p className="mt-2 font-bold">
              BẢN HIỆN TẠI ·{' '}
              {new Date().toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
              })}
              . Đối chiếu mã đơn, không pha trùng khi in lại. Món ghi ĐÃ HỦY:
              ngừng pha.
            </p>
          )}
        </header>
        <div className="py-2">
          {ticketItems(order.items, bar).map((item) => (
            <section
              key={item.id}
              className="receipt-line border-b border-dashed border-stone-300 py-3"
            >
              {item.status === 'VOIDED' && (
                <p className="font-bold">ĐÃ HỦY · {item.voidReason}</p>
              )}
              <div className="flex justify-between gap-2">
                <strong
                  className={item.status === 'VOIDED' ? 'line-through' : ''}
                >
                  {item.quantity} × {item.nameSnapshot}
                </strong>
                {!bar && (
                  <span className="shrink-0">
                    {formatVnd(
                      lineTotal({
                        price: item.priceSnapshot,
                        quantity: item.quantity,
                        toppings: item.toppings.map((t) => t.priceSnapshot),
                      }),
                    )}
                  </span>
                )}
              </div>
              {item.toppings.map((topping) => (
                <p key={topping.id} className="mt-1">
                  + {topping.nameSnapshot}
                  {!bar ? ' (' + formatVnd(topping.priceSnapshot) + ')' : ''}
                </p>
              ))}
              {item.note && (
                <p className="mt-1 font-bold">Ghi chú: {item.note}</p>
              )}
            </section>
          ))}
        </div>
        {order.note && <p className="mb-3 font-bold">{order.note}</p>}
        {!bar && (
          <>
            <dl className="space-y-2 border-b border-dashed border-black pb-3">
              <div className="flex justify-between">
                <dt>Tạm tính</dt>
                <dd>{formatVnd(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Giảm giá</dt>
                <dd>
                  {formatVnd(
                    discountAmount(
                      order.subtotal,
                      order.discountType
                        ? {
                            type: order.discountType,
                            value: order.discountValue,
                          }
                        : undefined,
                    ),
                  )}
                </dd>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <dt>TỔNG CỘNG</dt>
                <dd data-testid="receipt-total">{formatVnd(order.total)}</dd>
              </div>
              {payment && (
                <>
                  <div className="flex justify-between">
                    <dt>Thanh toán</dt>
                    <dd>
                      {payment.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
                    </dd>
                  </div>
                  {payment.method === 'CASH' && (
                    <>
                      <div className="flex justify-between">
                        <dt>Tiền khách đưa</dt>
                        <dd>{formatVnd(payment.received ?? 0)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Tiền thối</dt>
                        <dd>{formatVnd(payment.change ?? 0)}</dd>
                      </div>
                    </>
                  )}
                </>
              )}
            </dl>
            {confirmer && (
              <p className="mt-3">Người xác nhận: {confirmer.name}</p>
            )}
            <p className="py-4 text-center">{store.receiptFooter}</p>
          </>
        )}
      </article>
    </main>
  );
}
