'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  Coffee,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  LockKeyhole,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { PaymentDialog } from './payment';
import { PrintLinks } from './print-links';
import { cartTotal, lineTotal, formatVnd, type Discount } from '@/lib/money';
import { checkoutSchema } from '@/lib/sales-validation';
import type {
  MenuProduct,
  MenuTopping,
  SaleOrder,
  BankDetails,
} from '@/lib/sales-types';

type Line = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  toppingIds: string[];
  note: string;
};
type Props = {
  products: MenuProduct[];
  categories: { id: string; name: string }[];
  toppings: MenuTopping[];
  tables: { id: string; name: string; area: string }[];
  bank: BankDetails;
  hasShift: boolean;
};
const quickNotes = [
  'ít đá',
  'ít đường',
  'không đá',
  'không đường',
  'mang ly riêng',
];
export function Terminal({
  products,
  categories,
  toppings,
  tables,
  bank,
  hasShift,
}: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'TAKEAWAY' | 'DINE_IN'>('TAKEAWAY');
  const [tableId, setTableId] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>(
    'PERCENT',
  );
  const [discountValue, setDiscountValue] = useState('0');
  const [editor, setEditor] = useState<Line | null>(null);
  const [prepared, setPrepared] = useState<SaleOrder | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paid, setPaid] = useState<SaleOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function details(line: Line) {
    const product = products.find((p) => p.id === line.productId)!;
    const variant = product.variants.find((v) => v.id === line.variantId)!;
    const selected = toppings.filter((t) => line.toppingIds.includes(t.id));
    return {
      product,
      variant,
      selected,
      money: {
        price: variant.price,
        quantity: line.quantity,
        toppings: selected.map((t) => t.price),
      },
    };
  }
  const discount: Discount = {
    type: discountType,
    value: Number(discountValue),
  };
  let totals = { subtotal: 0, discount: 0, total: 0 };
  let valid = true;
  try {
    totals = cartTotal(
      lines.map((l) => details(l).money),
      discount,
    );
  } catch {
    valid = false;
  }
  const editedProduct = editor
    ? products.find((p) => p.id === editor.productId)
    : null;
  function add(product: MenuProduct) {
    if (
      prepared ||
      !hasShift ||
      !product.isAvailable ||
      !product.variants.length
    )
      return;
    const variant =
      product.variants.find((v) => v.name === 'M') ?? product.variants[0];
    setEditor({
      id: crypto.randomUUID(),
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      toppingIds: [],
      note: '',
    });
  }
  function saveLine() {
    if (!editor) return;
    setLines((previous) =>
      previous.some((l) => l.id === editor.id)
        ? previous.map((l) => (l.id === editor.id ? editor : l))
        : [...previous, editor],
    );
    setEditor(null);
    setError('');
  }
  async function checkout() {
    if (prepared) {
      setPaymentOpen(true);
      return;
    }
    const input = checkoutSchema.safeParse({
      id,
      type,
      ...(type === 'DINE_IN' ? { tableId } : {}),
      discount,
      lines: lines.map(({ variantId, quantity, toppingIds, note }) => ({
        variantId,
        quantity,
        toppingIds,
        note,
      })),
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data),
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order.error);
      if (order.status === 'PAID') {
        complete(order);
        return;
      }
      setPrepared(order);
      setPaymentOpen(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Không thể kết nối. Hãy thử lại với cùng mã đơn.',
      );
    } finally {
      setBusy(false);
    }
  }
  function complete(order: SaleOrder) {
    setPaid(order);
    setPrepared(null);
    setPaymentOpen(false);
    setLines([]);
    setId(crypto.randomUUID());
    setDiscountValue('0');
    setTableId('');
    setType('TAKEAWAY');
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-800">
            Quầy bán hàng
          </p>
          <h1 className="mt-1 text-3xl font-bold">Một ly ngon, một ngày vui</h1>
        </div>
        <Link
          href="/shifts"
          className={
            'rounded-full px-4 py-2 text-sm font-semibold ' +
            (hasShift
              ? 'bg-emerald-100 text-emerald-900'
              : 'bg-amber-100 text-amber-900')
          }
        >
          {hasShift ? 'Ca đang mở' : 'Mở ca để bán hàng'}
        </Link>
      </header>
      {!hasShift && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
          Quán chưa mở ca.{' '}
          <Link className="font-bold underline" href="/shifts">
            Mở ca làm việc
          </Link>{' '}
          trước khi nhận đơn.
        </p>
      )}
      {paid && (
        <section
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
          role="status"
        >
          <div>
            <p className="flex items-center gap-2 font-bold text-emerald-900">
              <CheckCircle2 size={22} aria-hidden="true" />
              Thanh toán thành công · {paid.code}
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {formatVnd(paid.total)}
            </p>
          </div>
          <PrintLinks id={paid.id} />
        </section>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-4">
          <div className="relative">
            <Search
              className="absolute top-3 left-4 text-stone-400"
              size={22}
              aria-hidden="true"
            />
            <Input
              aria-label="Tìm món"
              placeholder="Tìm món theo tên…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12"
            />
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-2"
            aria-label="Danh mục món"
          >
            {[{ id: '', name: 'Tất cả' }, ...categories].map((c) => (
              <button
                type="button"
                key={c.id}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={
                  'min-h-12 shrink-0 rounded-xl px-4 font-semibold ' +
                  (category === c.id
                    ? 'bg-emerald-800 text-white'
                    : 'border border-stone-200 bg-white text-stone-600')
                }
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4 xl:grid-cols-3">
            {products
              .filter(
                (p) =>
                  (!category || p.categoryId === category) &&
                  p.name
                    .toLocaleLowerCase('vi')
                    .includes(query.toLocaleLowerCase('vi')),
              )
              .map((product) => (
                <button
                  key={product.id}
                  data-testid="product-tile"
                  aria-label={'Chọn ' + product.name}
                  disabled={
                    !hasShift ||
                    !product.isAvailable ||
                    !!prepared ||
                    !product.variants.length
                  }
                  onClick={() => add(product)}
                  className="flex min-h-40 flex-col items-start rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-xs transition hover:border-emerald-400 active:scale-[.98] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40"
                >
                  <div className="mb-3 flex h-14 w-full items-center justify-between">
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 bg-cover bg-center text-amber-900"
                      style={
                        product.imageUrl
                          ? {
                              backgroundImage:
                                'url(' + JSON.stringify(product.imageUrl) + ')',
                            }
                          : undefined
                      }
                    >
                      {!product.imageUrl && (
                        <Coffee size={28} aria-hidden="true" />
                      )}
                    </span>
                    <Plus
                      size={20}
                      className="text-emerald-800"
                      aria-hidden="true"
                    />
                  </div>
                  <span className="font-bold">{product.name}</span>
                  <span className="mt-1 text-sm text-stone-500">
                    {product.isAvailable
                      ? product.variants.length
                        ? formatVnd(
                            (
                              product.variants.find((v) => v.name === 'M') ??
                              product.variants[0]
                            ).price,
                          )
                        : 'Chưa có giá'
                      : 'Hết hàng'}
                  </span>
                </button>
              ))}
          </div>
          {!products.some(
            (p) =>
              (!category || p.categoryId === category) &&
              p.name
                .toLocaleLowerCase('vi')
                .includes(query.toLocaleLowerCase('vi')),
          ) && (
            <p className="p-8 text-center text-stone-500">
              Không tìm thấy món phù hợp.
            </p>
          )}
        </section>
        <aside className="rounded-2xl border border-stone-200 bg-white p-5 lg:sticky lg:top-5">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <ShoppingBag size={22} aria-hidden="true" />
            Đơn hiện tại{' '}
            <span className="text-sm text-stone-400">({lines.length} món)</span>
          </h2>
          <div className="mb-4 flex gap-2">
            {(['TAKEAWAY', 'DINE_IN'] as const).map((value) => (
              <button
                key={value}
                disabled={!!prepared}
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={
                  'min-h-12 flex-1 rounded-xl border px-3 text-sm font-semibold ' +
                  (type === value
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-stone-200')
                }
              >
                {value === 'TAKEAWAY' ? 'Mang đi' : 'Tại bàn'}
              </button>
            ))}
          </div>
          {type === 'DINE_IN' && (
            <select
              aria-label="Chọn bàn"
              disabled={!!prepared}
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="mb-4 min-h-12 w-full rounded-xl border border-stone-300 px-3"
            >
              <option value="">Chọn bàn…</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name} · {table.area}
                </option>
              ))}
            </select>
          )}
          <div className="max-h-[43vh] space-y-3 overflow-y-auto">
            {!lines.length && (
              <div className="py-12 text-center text-stone-400">
                <Coffee size={42} className="mx-auto mb-3" aria-hidden="true" />
                <p>Chạm vào món để bắt đầu</p>
              </div>
            )}
            {lines.map((line) => {
              const { product, variant, selected, money } = details(line);
              return (
                <div
                  key={line.id}
                  data-testid="cart-line"
                  className="flex items-start justify-between gap-2 border-b border-stone-100 pb-3"
                >
                  <button
                    disabled={!!prepared}
                    className="min-h-12 flex-1 text-left"
                    onClick={() => setEditor(line)}
                  >
                    <span className="block font-semibold">
                      {line.quantity} × {product.name}{' '}
                      <span className="font-normal text-stone-400">
                        / {variant.name}
                      </span>
                    </span>
                    {selected.length > 0 && (
                      <span className="mt-1 block text-xs text-stone-500">
                        {selected.map((t) => t.name).join(', ')}
                      </span>
                    )}
                    {line.note && (
                      <span className="mt-1 block text-xs text-emerald-800">
                        {line.note}
                      </span>
                    )}
                    <span className="mt-2 block text-sm font-semibold">
                      {formatVnd(lineTotal(money))}
                    </span>
                  </button>
                  <button
                    disabled={!!prepared}
                    aria-label={'Xóa ' + product.name}
                    className="flex h-12 w-10 items-center justify-center text-stone-400 hover:text-red-700"
                    onClick={() =>
                      setLines(lines.filter((l) => l.id !== line.id))
                    }
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-stone-100 pt-4">
            <div className="mb-3 flex justify-between text-sm text-stone-500">
              <span>Tạm tính</span>
              <span>{formatVnd(totals.subtotal)}</span>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <label htmlFor="discount" className="flex-1 text-sm">
                Giảm giá
              </label>
              <Input
                id="discount"
                aria-label="Giảm giá"
                type="number"
                min={0}
                step={1}
                disabled={!!prepared}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-24"
              />
              <select
                aria-label="Kiểu giảm giá"
                disabled={!!prepared}
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as 'PERCENT' | 'AMOUNT')
                }
                className="min-h-12 rounded-xl border border-stone-300 px-2"
              >
                <option value="PERCENT">%</option>
                <option value="AMOUNT">₫</option>
              </select>
            </div>
            <div className="mb-4 flex justify-between text-xl font-bold">
              <span>Tổng cộng</span>
              <span data-testid="cart-total">{formatVnd(totals.total)}</span>
            </div>
            {prepared && (
              <p className="mb-3 flex items-center gap-2 text-xs text-amber-800">
                <LockKeyhole size={16} aria-hidden="true" />
                Đơn {prepared.code} đã chốt nội dung.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            {!valid && (
              <p role="alert" className="mb-3 text-sm text-red-700">
                Giảm giá không hợp lệ.
              </p>
            )}
            <Button
              className="w-full py-4 text-lg"
              disabled={busy || !hasShift || !lines.length || !valid}
              onClick={checkout}
            >
              {busy
                ? 'Đang chốt đơn…'
                : prepared
                  ? 'Tiếp tục thanh toán'
                  : 'Thanh toán'}
            </Button>
          </div>
        </aside>
      </div>
      {editor && editedProduct && (
        <Dialog title={editedProduct.name} onClose={() => setEditor(null)}>
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-3 font-semibold">Chọn size</legend>
              <div className="flex gap-3">
                {editedProduct.variants
                  .slice()
                  .sort(
                    (a, b) =>
                      ['S', 'M', 'L'].indexOf(a.name) -
                      ['S', 'M', 'L'].indexOf(b.name),
                  )
                  .map((variant) => (
                    <button
                      type="button"
                      key={variant.id}
                      aria-label={'Size ' + variant.name}
                      aria-pressed={editor.variantId === variant.id}
                      onClick={() =>
                        setEditor({ ...editor, variantId: variant.id })
                      }
                      className={
                        'min-h-16 flex-1 rounded-xl border p-3 ' +
                        (editor.variantId === variant.id
                          ? 'border-emerald-700 bg-emerald-50'
                          : 'border-stone-200')
                      }
                    >
                      <b>{variant.name}</b>
                      <span className="mt-1 block text-xs">
                        {formatVnd(variant.price)}
                      </span>
                    </button>
                  ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-3 font-semibold">Thêm topping</legend>
              <div className="grid grid-cols-2 gap-2">
                {toppings.map((topping) => (
                  <label
                    className={
                      'flex min-h-12 items-center gap-2 rounded-xl border border-stone-200 p-3 text-sm ' +
                      (!topping.isAvailable ? 'opacity-40' : '')
                    }
                    key={topping.id}
                  >
                    <input
                      aria-label={topping.name}
                      type="checkbox"
                      disabled={!topping.isAvailable}
                      checked={editor.toppingIds.includes(topping.id)}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          toppingIds: e.target.checked
                            ? [...editor.toppingIds, topping.id]
                            : editor.toppingIds.filter(
                                (id) => id !== topping.id,
                              ),
                        })
                      }
                      className="h-5 w-5 shrink-0 accent-emerald-800"
                    />
                    <span>
                      {topping.name}
                      <span className="block text-xs text-stone-500">
                        {topping.isAvailable
                          ? formatVnd(topping.price)
                          : 'Hết hàng'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block space-y-2">
              <span className="font-semibold">Ghi chú món</span>
              <Input
                aria-label="Ghi chú món"
                maxLength={300}
                value={editor.note}
                onChange={(e) => setEditor({ ...editor, note: e.target.value })}
                placeholder="Yêu cầu riêng của khách"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {quickNotes.map((note) => (
                <button
                  type="button"
                  key={note}
                  onClick={() =>
                    setEditor({
                      ...editor,
                      note: editor.note ? editor.note + ', ' + note : note,
                    })
                  }
                  className="min-h-11 rounded-full bg-stone-100 px-4 text-sm"
                >
                  {note}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Số lượng</span>
              <div className="flex items-center gap-4">
                <Button
                  aria-label="Giảm số lượng"
                  className="bg-stone-100 px-3 text-stone-700 hover:bg-stone-200"
                  disabled={editor.quantity <= 1}
                  onClick={() =>
                    setEditor({ ...editor, quantity: editor.quantity - 1 })
                  }
                >
                  <Minus size={20} aria-hidden="true" />
                </Button>
                <strong aria-label="Số lượng">{editor.quantity}</strong>
                <Button
                  aria-label="Tăng số lượng"
                  className="bg-stone-100 px-3 text-stone-700 hover:bg-stone-200"
                  disabled={editor.quantity >= 99}
                  onClick={() =>
                    setEditor({ ...editor, quantity: editor.quantity + 1 })
                  }
                >
                  <Plus size={20} aria-hidden="true" />
                </Button>
              </div>
            </div>
            <Button
              className="sticky bottom-0 w-full text-lg"
              onClick={saveLine}
            >
              {lines.some((l) => l.id === editor.id)
                ? 'Lưu món'
                : 'Thêm vào đơn'}{' '}
              · {formatVnd(lineTotal(details(editor).money))}
            </Button>
          </div>
        </Dialog>
      )}
      {paymentOpen && prepared && (
        <PaymentDialog
          order={prepared}
          bank={bank}
          onPaid={complete}
          onClose={() => setPaymentOpen(false)}
        />
      )}
    </div>
  );
}
