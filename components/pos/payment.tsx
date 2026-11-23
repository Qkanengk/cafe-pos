'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Banknote, QrCode, CheckCircle2, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { Dialog } from '@/components/ui/dialog';
import {
  cashSuggestions,
  changeDue,
  formatVnd,
  parseVndInput,
} from '@/lib/money';
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
  paymentId,
}: {
  order: SaleOrder;
  bank: BankDetails;
  onPaid: (order: SaleOrder) => void;
  onClose: () => void;
  paymentId: string;
}) {
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [received, setReceived] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
      change = changeDue(order.total, parseVndInput(received));
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
              ? { id: paymentId, method, received: parseVndInput(received) }
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
                received: parseVndInput(received),
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
      className="payment-dialog"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="payment-layout">
        <aside className="payment-summary">
          <p className="text-sm text-stone-500">Số tiền cần thanh toán</p>
          <p
            data-testid="payment-total"
            className="mt-2 text-3xl font-semibold tracking-tight"
          >
            {formatVnd(order.total)}
          </p>
          <p className="mt-3 text-xs text-stone-500">
            Nội dung: <strong className="text-stone-700">{order.code}</strong>
          </p>
          <div className="mt-7 grid gap-2">
            <Button
              aria-pressed={method === 'CASH'}
              className={
                method === 'CASH'
                  ? ''
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
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
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
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
          <p className="mt-auto pt-8 text-xs leading-5 text-stone-500">
            Thanh toán theo phiên bản đơn hiện tại. Đóng để tiếp tục giữ/sửa
            đơn.
          </p>
        </aside>
        <div className="payment-entry">
          {method === 'CASH' ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="cash-received" className="font-medium">
                  Tiền khách đưa (₫)
                </label>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Xóa tiền khách đưa"
                  onClick={() => setReceived('')}
                  className="h-9 w-12 rounded-md border border-stone-300 font-semibold"
                >
                  C
                </button>
              </div>
              <MoneyInput
                id="cash-received"
                aria-label="Tiền khách đưa"
                min={0}
                step={1}
                value={received}
                onValueChange={setReceived}
                className="h-14 text-right text-2xl font-semibold"
                inputMode="numeric"
              />
              <div className="my-3 grid grid-cols-4 gap-2">
                {cashSuggestions(order.total)
                  .slice(0, 4)
                  .map((value) => (
                    <button
                      type="button"
                      data-testid="cash-suggestion"
                      aria-label={'Khách đưa ' + value}
                      key={value}
                      onClick={() => setReceived(String(value))}
                      disabled={busy}
                      className="min-h-10 rounded-md border border-stone-300 px-1 text-xs font-medium hover:bg-stone-50"
                    >
                      {formatVnd(value)}
                    </button>
                  ))}
              </div>
              <div className="cash-keypad">
                {[
                  '1',
                  '2',
                  '3',
                  '4',
                  '5',
                  '6',
                  '7',
                  '8',
                  '9',
                  '000',
                  '0',
                  'backspace',
                ].map((key) => (
                  <button
                    type="button"
                    key={key}
                    disabled={busy}
                    aria-label={key === 'backspace' ? 'Xóa chữ số cuối' : key}
                    onClick={() =>
                      setReceived((current) =>
                        key === 'backspace'
                          ? current.slice(0, -1)
                          : ((current === '0' ? '' : current) + key)
                              .replace(/^0+(?=\d)/, '')
                              .slice(0, 10),
                      )
                    }
                  >
                    {key === 'backspace' ? (
                      <Delete size={23} aria-hidden="true" />
                    ) : (
                      key
                    )}
                  </button>
                ))}
              </div>
              <div className="my-4 flex items-center justify-between border-t border-stone-200 pt-4">
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
              <div className="mb-4 flex items-center justify-center rounded-md border border-stone-200">
                {qr ? (
                  <Image
                    unoptimized
                    src={qr}
                    width={300}
                    height={300}
                    alt={'Mã VietQR ' + order.code}
                    className="h-auto w-full max-w-72"
                  />
                ) : (
                  <p className="py-20">Đang tạo mã QR tại máy…</p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-stone-500">Ngân hàng / BIN</dt>
                  <dd className="font-semibold">{bank.bankBin}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Số tài khoản</dt>
                  <dd className="font-semibold">{bank.bankAccount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Chủ tài khoản</dt>
                  <dd className="font-semibold">{bank.bankAccountName}</dd>
                </div>
              </dl>
              <label className="my-4 flex min-h-12 items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
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
            className="mt-auto min-h-12 w-full text-base"
            disabled={
              busy || (method === 'CASH' ? change === null : !confirmed || !qr)
            }
            onClick={pay}
          >
            <CheckCircle2 size={22} className="mr-2" aria-hidden="true" />
            {busy ? 'Đang lưu…' : 'Xác nhận đã nhận tiền'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
