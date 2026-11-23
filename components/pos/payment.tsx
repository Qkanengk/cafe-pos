'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Banknote, QrCode, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { cashSuggestions, changeDue, formatVnd } from '@/lib/money';
import { renderVietQR } from '@/lib/vietqr';
import { payLocal } from '@/lib/offline';
import { posFetch } from '@/lib/pos-fetch';
import { PaymentConflictError } from '@/lib/payment-conflict';
import { PrintLinks } from './print-links';
import type { SaleOrder, BankDetails } from '@/lib/sales-types';
export function PaymentDialog({
  order,
  bank,
  onPaid,
  onClose,
}: {
  order: SaleOrder;
  bank: BankDetails;
  onPaid: (order: SaleOrder) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [received, setReceived] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentId] = useState(() => crypto.randomUUID());
  const [existingPaid, setExistingPaid] = useState<SaleOrder | null>(null);
  useEffect(() => {
    if (method !== 'BANK_TRANSFER') return;
    let active = true;
    renderVietQR({
      bankBin: bank.bankBin,
      account: bank.bankAccount,
      amount: order.total,
      orderCode: order.code,
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active)
          setError(
            'Không thể tạo mã QR. Kiểm tra thông tin ngân hàng trong cài đặt.',
          );
      });
    return () => {
      active = false;
    };
  }, [method, bank.bankBin, bank.bankAccount, order.total, order.code]);
  let change: number | null = null;
  if (received !== '')
    try {
      change = changeDue(order.total, Number(received));
    } catch {}
  async function pay() {
    setBusy(true);
    setError('');
    try {
      if (order.code.startsWith('TAM-')) {
        onPaid(
          await payLocal(
            order,
            method === 'CASH'
              ? { id: paymentId, method, received: Number(received) }
              : { id: paymentId, method, confirmed: true },
          ),
        );
        return;
      }
      const response = await posFetch('/api/orders/' + order.id + '/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method === 'CASH'
            ? {
                id: paymentId,
                method,
                received: Number(received),
                version: order.version,
              }
            : {
                id: paymentId,
                method,
                confirmed: true,
                version: order.version,
              },
        ),
      });
      const result = await response.json();
      if (response.status === 409 && result.details?.order?.status === 'PAID')
        throw new PaymentConflictError(result.details.order);
      if (!response.ok) throw new Error(result.error);
      onPaid(result);
    } catch (e) {
      if (e instanceof PaymentConflictError) setExistingPaid(e.order);
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể kết nối. Có thể thử lại an toàn.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (existingPaid)
    return (
      <Dialog title="Đơn đã được thanh toán" onClose={onClose}>
        <div className="space-y-4">
          <p role="alert">
            Đơn đã được thu tiền trước đó. Lần này không nhận thêm tiền, không
            trả tiền thừa dự kiến.
          </p>
          <strong>
            {existingPaid.code} · {formatVnd(existingPaid.total)}
          </strong>
          {existingPaid.payments.map((p) => (
            <p key={p.id}>
              {p.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} · Đã nhận{' '}
              {formatVnd(p.received ?? p.amount)} · Tiền thừa đã ghi{' '}
              {formatVnd(p.change ?? 0)}
            </p>
          ))}
          {!existingPaid.code.startsWith('TAM-') && (
            <PrintLinks id={existingPaid.id} />
          )}
          <a className="block underline" href="/pos">
            Bắt đầu đơn mới
          </a>
        </div>
      </Dialog>
    );
  return (
    <Dialog
      title={'Thanh toán ' + order.code}
      wide={method === 'BANK_TRANSFER'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="mb-5 flex gap-3">
        <Button
          aria-pressed={method === 'CASH'}
          className={
            method === 'CASH'
              ? ''
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
          }
          onClick={() => {
            setMethod('CASH');
            setError('');
          }}
          disabled={busy}
        >
          <Banknote size={20} className="mr-2" aria-hidden="true" />
          Tiền mặt
        </Button>
        <Button
          aria-pressed={method === 'BANK_TRANSFER'}
          className={
            method === 'BANK_TRANSFER'
              ? ''
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
          }
          onClick={() => {
            setMethod('BANK_TRANSFER');
            setError('');
          }}
          disabled={busy}
        >
          <QrCode size={20} className="mr-2" aria-hidden="true" />
          Chuyển khoản
        </Button>
      </div>
      <div
        className={
          method === 'BANK_TRANSFER' ? 'grid gap-7 sm:grid-cols-2' : ''
        }
      >
        {method === 'BANK_TRANSFER' && (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-stone-200 bg-white">
            {qr ? (
              <Image
                unoptimized
                src={qr}
                width={360}
                height={360}
                alt={'Mã VietQR ' + order.code}
                className="h-auto w-full max-w-96"
              />
            ) : (
              <p>Đang tạo mã QR tại máy…</p>
            )}
          </div>
        )}
        <div>
          <div className="mb-5 rounded-2xl bg-emerald-50 p-5">
            <p className="text-sm text-emerald-800">Số tiền cần thanh toán</p>
            <p
              data-testid="payment-total"
              className="mt-2 text-4xl font-bold text-emerald-950"
            >
              {formatVnd(order.total)}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Nội dung: {order.code}
            </p>
          </div>
          {method === 'CASH' ? (
            <>
              <label className="block space-y-2 font-medium">
                <span>Tiền khách đưa (₫)</span>
                <Input
                  aria-label="Tiền khách đưa"
                  type="number"
                  min={0}
                  step={1}
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  className="text-2xl"
                  inputMode="numeric"
                />
              </label>
              <div className="my-4 flex flex-wrap gap-2">
                {cashSuggestions(order.total).map((value) => (
                  <button
                    type="button"
                    data-testid="cash-suggestion"
                    aria-label={'Khách đưa ' + value}
                    key={value}
                    onClick={() => setReceived(String(value))}
                    className="min-h-12 rounded-xl border border-emerald-200 bg-emerald-50 px-4 font-semibold text-emerald-900"
                  >
                    {formatVnd(value)}
                  </button>
                ))}
              </div>
              <div className="mb-5 flex items-center justify-between rounded-xl bg-stone-100 p-4">
                <span>Tiền thối</span>
                <strong data-testid="cash-change" className="text-2xl">
                  {change === null ? '—' : formatVnd(change)}
                </strong>
              </div>
              {received !== '' && change === null && (
                <p className="mb-3 text-red-700">
                  Tiền khách đưa chưa đủ hoặc không hợp lệ.
                </p>
              )}
            </>
          ) : (
            <>
              <dl className="space-y-3 rounded-xl bg-stone-50 p-4">
                <div>
                  <dt className="text-xs text-stone-500">Ngân hàng / BIN</dt>
                  <dd className="font-semibold">{bank.bankBin}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Số tài khoản</dt>
                  <dd className="text-2xl font-bold">{bank.bankAccount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Chủ tài khoản</dt>
                  <dd className="font-semibold">{bank.bankAccountName}</dd>
                </div>
              </dl>
              <label className="my-5 flex min-h-12 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <input
                  className="h-6 w-6 shrink-0 accent-emerald-800"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Tôi đã kiểm tra và nhận đủ tiền chuyển khoản.
              </label>
              <p className="mb-4 text-xs text-stone-500">
                QR không tự xác minh giao dịch. Người xác nhận được ghi nhận
                trong thanh toán.
              </p>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="my-3 rounded-xl bg-red-50 p-3 text-red-800"
            >
              {error}
              {error.includes('tải lại') && (
                <a
                  className="ml-2 font-bold underline"
                  href={'/pos?orderId=' + order.id}
                >
                  Tải lại đơn
                </a>
              )}
            </p>
          )}
          <Button
            className="w-full text-lg"
            disabled={
              busy || (method === 'CASH' ? change === null : !confirmed || !qr)
            }
            onClick={pay}
          >
            <CheckCircle2 size={22} className="mr-2" aria-hidden="true" />
            {busy ? 'Đang lưu…' : 'Xác nhận đã nhận tiền'}
          </Button>
          <p className="mt-4 text-center text-xs text-stone-400">
            Thanh toán theo phiên bản đơn hiện tại. Đóng để tiếp tục giữ/sửa
            đơn.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
