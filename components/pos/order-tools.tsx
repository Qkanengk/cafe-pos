'use client';
import { useState } from 'react';
import { GitMerge, Scissors, MoveRight, ShieldAlert } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SaleOrder } from '@/lib/sales-types';
import { formatVnd } from '@/lib/money';
import { posFetch } from '@/lib/pos-fetch';
type Table = { id: string; name: string; area: string };
type Action = 'SPLIT' | 'MERGE' | 'MOVE' | 'VOID' | 'CANCEL';
const labels = {
  SPLIT: 'Tách đơn',
  MERGE: 'Gộp đơn',
  MOVE: 'Chuyển bàn',
  VOID: 'Hủy món',
  CANCEL: 'Hủy đơn',
};
export function OrderTools({
  order,
  tables,
  onChange,
}: {
  order: SaleOrder;
  tables: Table[];
  onChange: (order: SaleOrder) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [sources, setSources] = useState<SaleOrder[]>([]);
  const [target, setTarget] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [splitId, setSplitId] = useState(() => crypto.randomUUID());
  async function open(value: Action) {
    setSplitId(crypto.randomUUID());
    setAction(value);
    setTarget('');
    setQuantities({});
    setPin('');
    setReason('');
    setError('');
    if (value === 'MERGE')
      try {
        const r = await posFetch('/api/orders');
        if (!r.ok) throw new Error('Không thể tải đơn');
        setSources(
          (await r.json()).filter(
            (o: SaleOrder) => o.status === 'OPEN' && o.id !== order.id,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không thể kết nối');
      }
  }
  async function submit() {
    if (!action) return;
    setBusy(true);
    setError('');
    const source = sources.find((s) => s.id === target);
    const body = {
      action,
      version: order.version,
      ...(action === 'SPLIT'
        ? {
            newId: splitId,
            items: Object.entries(quantities)
              .filter(([, q]) => q > 0)
              .map(([itemId, quantity]) => ({ itemId, quantity })),
          }
        : action === 'MERGE'
          ? { sourceId: target, sourceVersion: source?.version }
          : action === 'MOVE'
            ? { tableId: target }
            : {
                ownerPin: pin,
                reason,
                ...(action === 'VOID' ? { itemId: target } : {}),
              }),
    };
    try {
      const r = await posFetch('/api/orders/' + order.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setAction(null);
      onChange(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể kết nối. Hãy tải lại đơn trước khi thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Thao tác đơn">
        {(Object.keys(labels) as Action[]).map((value) => (
          <Button
            key={value}
            className="min-h-11 bg-white px-3 py-2 text-sm text-emerald-900 border border-stone-200 hover:bg-stone-100"
            onClick={() => open(value)}
          >
            {value === 'SPLIT' ? (
              <Scissors size={16} className="mr-2" />
            ) : value === 'MERGE' ? (
              <GitMerge size={16} className="mr-2" />
            ) : value === 'MOVE' ? (
              <MoveRight size={16} className="mr-2" />
            ) : (
              <ShieldAlert size={16} className="mr-2" />
            )}
            {labels[value]}
          </Button>
        ))}
      </div>
      {action && (
        <Dialog
          title={labels[action] + ' · ' + order.code}
          onClose={() => {
            if (!busy) setAction(null);
          }}
        >
          <div className="space-y-5">
            {action === 'VOID' || action === 'CANCEL' ? (
              <>
                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  Cần chủ quán cho phép. Thao tác và lý do được lưu vào nhật ký,
                  không xóa lịch sử.
                </p>
                {action === 'VOID' && (
                  <label className="block space-y-2">
                    <span>Món cần hủy</span>
                    <select
                      aria-label="Món cần hủy"
                      className="min-h-12 w-full rounded-xl border p-3"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Chọn món…</option>
                      {order.items
                        .filter((i) => i.status === 'ACTIVE')
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.quantity} × {i.nameSnapshot}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="block space-y-2">
                  <span>Lý do</span>
                  <Input
                    aria-label="Lý do"
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label className="block space-y-2">
                  <span>PIN chủ quán</span>
                  <Input
                    aria-label="PIN chủ quán"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                </label>
              </>
            ) : action === 'SPLIT' ? (
              <>
                <p className="text-sm text-stone-500">
                  Chọn số lượng chuyển sang đơn mới, giữ lại ít nhất một món.
                  Giảm giá được phân bổ theo tạm tính, giữ nguyên tổng tiền hai
                  đơn.
                </p>
                {order.items
                  .filter((i) => i.status === 'ACTIVE')
                  .map((i) => (
                    <label
                      key={i.id}
                      className="flex items-center justify-between gap-4 rounded-xl bg-stone-50 p-3"
                    >
                      <span>
                        {i.quantity} × {i.nameSnapshot}
                      </span>
                      <Input
                        className="w-24"
                        aria-label={'Tách ' + i.nameSnapshot}
                        type="number"
                        min={0}
                        max={i.quantity}
                        step={1}
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
              </>
            ) : (
              <label className="block space-y-2">
                <span>
                  {action === 'MOVE'
                    ? 'Bàn đích'
                    : 'Đơn chuyển vào đơn hiện tại'}
                </span>
                <select
                  aria-label={action === 'MOVE' ? 'Bàn đích' : 'Đơn gộp'}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="min-h-12 w-full rounded-xl border p-3"
                >
                  <option value="">Chọn…</option>
                  {action === 'MOVE'
                    ? tables
                        .filter((t) => t.id !== order.tableId)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {t.area}
                          </option>
                        ))
                    : sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.table?.name ?? 'Mang đi'} ·{' '}
                          {formatVnd(s.total)}
                        </option>
                      ))}
                </select>
                {action === 'MERGE' && (
                  <p className="text-sm text-stone-500">
                    Chuyển toàn bộ món còn bán sang đơn này. Đơn nguồn đóng; hai
                    khoản giảm giá được cộng thành giảm tiền.
                  </p>
                )}
              </label>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
                {error}{' '}
                {error.includes('tải lại') && (
                  <a
                    href={'/pos?orderId=' + order.id}
                    className="font-bold underline"
                  >
                    Tải lại đơn
                  </a>
                )}
              </p>
            )}
            <Button
              className="w-full"
              disabled={
                busy ||
                ((action === 'VOID' || action === 'CANCEL') &&
                  (!reason.trim() || pin.length < 4)) ||
                (action !== 'SPLIT' && action !== 'CANCEL' && !target)
              }
              onClick={submit}
            >
              {busy
                ? 'Đang lưu…'
                : 'Xác nhận ' + labels[action].toLocaleLowerCase('vi')}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
