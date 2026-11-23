'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Clock3, Banknote, ArrowRight, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { formatVnd, shiftDifference, parseVndInput } from '@/lib/money';
import { openShiftSchema, closeShiftSchema } from '@/lib/sales-validation';
import type { ShiftView } from '@/lib/sales-types';
import { refreshSnapshot } from '@/lib/offline';
import { posFetch } from '@/lib/pos-fetch';
const time = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));
export function Shifts({ initial }: { initial: ShiftView[] }) {
  const [shifts, setShifts] = useState(initial);
  const [opening, setOpening] = useState('500000');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<ShiftView | null>(null);
  const active = shifts.find((s) => !s.closedAt);
  let difference: number | null = null;
  if (active && counted !== '')
    try {
      difference = shiftDifference(active.expectedCash, parseVndInput(counted));
    } catch {}
  async function submit(event: FormEvent, action: 'open' | 'close') {
    event.preventDefault();
    setError('');
    const parsed =
      action === 'open'
        ? openShiftSchema.safeParse({ openingCash: parseVndInput(opening) })
        : closeShiftSchema.safeParse({
            id: active?.id,
            countedCash: parseVndInput(counted),
            note,
          });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    setBusy(true);
    try {
      const response = await posFetch('/api/shifts', {
        method: action === 'open' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refreshSnapshot();
      const refresh = await posFetch('/api/shifts');
      if (!refresh.ok) throw new Error('Đã lưu, vui lòng tải lại trang.');
      setShifts(await refresh.json());
      if (action === 'close') setClosed(result);
      else setClosed(null);
      setCounted('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể kết nối.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shifts-workspace space-y-4">
      <header>
        <h1>Ca làm việc</h1>
        <p className="mt-1 text-xs text-stone-500">
          Một ca chung cho các thiết bị. Mọi khoản thu đều gắn với ca đang mở.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {closed && (
        <section
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
        >
          <h2 className="text-xl font-bold text-emerald-900">Đã đóng ca</h2>
          <p className="mt-2">
            Tiền mặt dự kiến:{' '}
            <strong data-testid="closed-expected">
              {formatVnd(closed.expectedCash)}
            </strong>
          </p>
          <p>Thực đếm: {formatVnd(closed.countedCash ?? 0)}</p>
          <p>
            Chênh lệch:{' '}
            <strong data-testid="closed-difference">
              {formatVnd(closed.difference ?? 0)}
            </strong>
          </p>
        </section>
      )}
      {active ? (
        <section className="shift-reconciliation">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Clock3 size={24} aria-hidden="true" />
              Ca đang mở
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              {active.opener.name} · {time(active.openedAt)}
            </p>
            <dl className="shift-summary">
              <div className="flex justify-between gap-3">
                <dt>Tiền đầu ca</dt>
                <dd>{formatVnd(active.openingCash)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Thu tiền mặt (sau thối)</dt>
                <dd>{formatVnd(active.cashSales)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Chuyển khoản</dt>
                <dd>{formatVnd(active.bankSales)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-stone-200 pt-4 text-lg font-bold">
                <dt>Tiền mặt dự kiến</dt>
                <dd data-testid="expected-cash">
                  {formatVnd(active.expectedCash)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-stone-500">
              {active.paidCount} đơn đã thanh toán · {active.openCount} đơn chờ
            </p>
            <Link
              className="mt-5 inline-flex min-h-12 items-center gap-2 font-bold text-emerald-800"
              href="/pos"
            >
              Tiếp tục bán hàng
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          </div>
          <form onSubmit={(e) => submit(e, 'close')} className="shift-close">
            <h3 className="mb-5 text-lg font-bold">Đối soát & đóng ca</h3>
            <label className="block space-y-2">
              <span>Tiền mặt thực đếm (₫)</span>
              <MoneyInput
                aria-label="Tiền mặt thực đếm"
                min={0}
                step={1}
                required
                value={counted}
                onValueChange={setCounted}
              />
            </label>
            <div className="my-4 flex justify-between">
              <span>Chênh lệch</span>
              <strong
                data-testid="shift-difference"
                className={difference ? 'text-amber-800' : 'text-emerald-800'}
              >
                {difference === null ? '—' : formatVnd(difference)}
              </strong>
            </div>
            <label className="block space-y-2">
              <span>Ghi chú đóng ca</span>
              <Input
                aria-label="Ghi chú đóng ca"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {active.openCount > 0 && (
              <p className="mt-3 text-sm text-amber-800">
                Còn đơn chờ thanh toán. Hoàn tất tại trang Đơn hàng trước khi
                đóng ca.
              </p>
            )}
            <Button
              className="mt-5 w-full"
              disabled={
                busy ||
                counted === '' ||
                difference === null ||
                active.openCount > 0
              }
            >
              <LockKeyhole size={20} className="mr-2" aria-hidden="true" />
              {busy ? 'Đang lưu…' : 'Đóng ca'}
            </Button>
          </form>
        </section>
      ) : (
        <form
          onSubmit={(e) => submit(e, 'open')}
          className="max-w-md rounded-md border border-stone-200 bg-white p-5"
        >
          <h2 className="mb-5 flex items-center gap-2 text-xl font-bold">
            <Banknote size={24} aria-hidden="true" />
            Bắt đầu ca mới
          </h2>
          <label className="block space-y-2">
            <span>Tiền đầu ca (₫)</span>
            <MoneyInput
              aria-label="Tiền đầu ca"
              min={0}
              step={1}
              required
              value={opening}
              onValueChange={setOpening}
            />
          </label>
          <Button className="mt-5 w-full" disabled={busy || opening === ''}>
            {busy ? 'Đang mở ca…' : 'Mở ca'}
          </Button>
        </form>
      )}
      <section>
        <h2 className="mb-3 text-base font-semibold">Lịch sử ca</h2>
        <div className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
          {!shifts.some((s) => s.closedAt) && (
            <p className="rounded-xl bg-white p-6 text-stone-500">
              Chưa có ca đã đóng.
            </p>
          )}
          {shifts
            .filter((s) => s.closedAt)
            .map((shift) => (
              <article
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <h3 className="font-bold">
                    {time(shift.openedAt)} — {time(shift.closedAt!)}
                  </h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {shift.opener.name} mở · {shift.closer?.name} đóng ·{' '}
                    {shift.paidCount} đơn
                  </p>
                  {shift.note && <p className="mt-2 text-sm">{shift.note}</p>}
                </div>
                <div className="text-sm">
                  <p>
                    Dự kiến: {formatVnd(shift.expectedCash)} · Thực đếm:{' '}
                    {formatVnd(shift.countedCash ?? 0)}
                  </p>
                  <p
                    className={
                      'mt-1 font-bold ' +
                      (shift.difference ? 'text-amber-800' : 'text-emerald-800')
                    }
                  >
                    Chênh lệch {formatVnd(shift.difference ?? 0)}
                  </p>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
