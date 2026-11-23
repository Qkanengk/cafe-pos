'use client';
import { useState } from 'react';
import type { SaleOrder } from '@/lib/sales-types';
import { formatVnd, sumMoney } from '@/lib/money';
import { planRefund } from '@/lib/refund-amount';
import { posFetch } from '@/lib/pos-fetch';
import { Button } from '@/components/ui/button';
export function RefundControl({
  order,
  onChange,
}: {
  order: SaleOrder;
  onChange: (order: SaleOrder) => void;
}) {
  const [mode, setMode] = useState('FULL'),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [reason, setReason] = useState(''),
    [pin, setPin] = useState(''),
    [method, setMethod] = useState('CASH'),
    [id, setId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const selection =
    mode === 'FULL'
      ? undefined
      : Object.entries(quantities)
          .filter(([, q]) => q > 0)
          .map(([itemId, quantity]) => ({ itemId, quantity }));
  let amount = 0;
  try {
    amount = sumMoney(planRefund(order, selection).map((i) => i.amount));
  } catch {}
  const refunded = sumMoney(order.refunds?.map((r) => r.amount) ?? []);
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Hoàn tiền / sửa hóa đơn</h3>
      <p>
        Đã hoàn {formatVnd(refunded)} · Còn có thể hoàn{' '}
        {formatVnd(order.total - refunded)}
      </p>
      {order.refunds?.map((r) => (
        <p key={r.id} className="text-sm">
          Hoàn {formatVnd(r.amount)} · {r.reason}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      {refunded < order.total && (
        <details>
          <summary className="cursor-pointer py-3 font-semibold">
            Hoàn tiền có PIN chủ quán
          </summary>
          <p className="text-sm">
            Giữ nguyên hóa đơn gốc; ghi khoản chi âm vào ca đang mở. Xác nhận đã
            thực trả tiền theo phương thức chọn bên dưới.
          </p>
          <label className="my-3 block">
            Phạm vi hoàn
            <select
              aria-label="Phạm vi hoàn"
              className="block w-full border p-2"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="FULL">Toàn bộ số tiền còn lại</option>
              <option value="ITEMS">Theo món / số lượng</option>
            </select>
          </label>
          {mode === 'ITEMS' &&
            order.items
              .filter((i) => i.status === 'ACTIVE')
              .map((i) => (
                <label
                  key={i.id}
                  className="my-2 flex items-center justify-between gap-2"
                >
                  {i.nameSnapshot}
                  <input
                    aria-label={'Số lượng hoàn ' + i.nameSnapshot}
                    className="w-20 border p-2"
                    type="number"
                    min="0"
                    max={
                      i.quantity -
                      (order.refunds
                        ?.flatMap((r) => r.items)
                        .filter((line) => line.itemId === i.id)
                        .reduce((s, line) => s + line.quantity, 0) ?? 0)
                    }
                    value={quantities[i.id] ?? 0}
                    onChange={(e) =>
                      setQuantities({
                        ...quantities,
                        [i.id]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
          <label className="block">
            Phương thức hoàn
            <select
              aria-label="Phương thức hoàn"
              className="block w-full border p-2"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
            </select>
          </label>
          <label className="block">
            Lý do hoàn
            <textarea
              className="block w-full border p-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </label>
          <label className="block">
            PIN chủ quán
            <input
              className="block w-full border p-2"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={6}
              autoComplete="off"
            />
          </label>
          <Button
            className="mt-3 w-full"
            disabled={
              busy || !amount || !reason.trim() || !/^\d{4,6}$/.test(pin)
            }
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const response = await posFetch(
                  '/api/orders/' + order.id + '/refunds',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id,
                      version: order.version,
                      amount,
                      ownerPin: pin,
                      reason,
                      method,
                      items: selection,
                    }),
                  },
                );
                const result = await response.json();
                if (!response.ok) {
                  if (response.status === 409 && result.details?.order) {
                    onChange(result.details.order);
                    setPin('');
                    setId(crypto.randomUUID());
                  }
                  throw new Error(result.error);
                }
                onChange(result);
                setPin('');
                setReason('');
                setQuantities({});
                setId(crypto.randomUUID());
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Không thể hoàn tiền',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? 'Đang ghi hoàn tiền…'
              : 'Xác nhận đã hoàn ' + formatVnd(amount)}
          </Button>
        </details>
      )}
    </section>
  );
}
