'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
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
import { MoneyInput } from '@/components/ui/money-input';
import { Dialog } from '@/components/ui/dialog';
import { PaymentDialog } from './payment';
import { PrintLinks } from './print-links';
import { OrderTools } from './order-tools';
import { prepareLocal, syncedCode } from '@/lib/offline';
import { checkoutWithFallback } from '@/lib/checkout-client';
import { posFetch } from '@/lib/pos-fetch';
import { serialPoll, orderViewChanged } from '@/lib/live-state';
import {
  readWorkingCart,
  saveWorkingCart,
  clearWorkingCart,
  tabPaymentId,
} from '@/lib/cart-storage';
import {
  orderLines,
  reapplyPending,
  orderCompletionMessage,
  orderLineVariant,
  restoreLineIdentities,
  type WorkingLine as Line,
} from '@/lib/order-recovery';
import {
  cartTotal,
  lineTotal,
  formatVnd,
  startingPrice,
  parseVndInput,
  parseDiscountInput,
  type Discount,
} from '@/lib/money';
import { checkoutSchema } from '@/lib/sales-validation';
import type {
  MenuProduct,
  MenuTopping,
  SaleOrder,
  BankDetails,
} from '@/lib/sales-types';

type Props = {
  actorId: string;
  products: MenuProduct[];
  categories: { id: string; name: string }[];
  toppings: MenuTopping[];
  tables: { id: string; name: string; area: string }[];
  bank: BankDetails;
  hasShift: boolean;
  initialOrder?: SaleOrder;
  initialTableId?: string;
  offlineMode?: boolean;
};
const quickNotes = [
  'ít đá',
  'ít đường',
  'không đá',
  'không đường',
  'mang ly riêng',
];
const categoryColors = [
  '#8d7156',
  '#61798b',
  '#83764f',
  '#7b6c88',
  '#628477',
  '#8b6b6b',
];
const subscribeToToolbar = () => () => {};
export function Terminal({
  actorId,
  products,
  categories,
  toppings,
  tables,
  bank,
  hasShift,
  initialOrder,
  initialTableId,
  offlineMode = false,
}: Props) {
  const toolbar = useSyncExternalStore(
    subscribeToToolbar,
    () => document.getElementById('register-toolbar'),
    () => null,
  );
  const [lines, setLines] = useState<Line[]>(() => orderLines(initialOrder));
  const [id, setId] = useState(() => initialOrder?.id ?? crypto.randomUUID());
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [cartScope, setCartScope] = useState(
    initialOrder?.id ?? (initialTableId ? 'table:' + initialTableId : 'new'),
  );
  const [cartReady, setCartReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'TAKEAWAY' | 'DINE_IN'>(
    initialOrder?.type ?? (initialTableId ? 'DINE_IN' : 'TAKEAWAY'),
  );
  const [tableId, setTableId] = useState(
    initialOrder?.tableId ?? initialTableId ?? '',
  );
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>(
    initialOrder?.discountType ?? 'PERCENT',
  );
  const [discountValue, setDiscountValue] = useState(
    String(initialOrder?.discountValue ?? 0),
  );
  const [editor, setEditor] = useState<Line | null>(null);
  const [prepared, setPrepared] = useState<SaleOrder | null>(
    initialOrder ?? null,
  );
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paid, setPaid] = useState<SaleOrder | null>(null);
  useEffect(() => {
    if (!paid?.code.startsWith('TAM-')) return;
    let active = true;
    const id = paid.id;
    const update = () => {
      void syncedCode(id)
        .then((code) => {
          if (active && code)
            setPaid((current) =>
              current?.id === id ? { ...current, code } : current,
            );
        })
        .catch(() => {});
    };
    update();
    window.addEventListener('cafe-offline-change', update);
    return () => {
      active = false;
      window.removeEventListener('cafe-offline-change', update);
    };
  }, [paid]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        const saved = readWorkingCart(
          actorId,
          initialOrder?.id ??
            (initialTableId ? 'table:' + initialTableId : 'new'),
        );
        if (!active) return;
        if (saved) {
          setLines(restoreLineIdentities(saved.lines));
          setId(saved.id);
          setPaymentId((current) => tabPaymentId(actorId, saved.id, current));
          setType(saved.type);
          setTableId(saved.tableId);
          setDiscountType(saved.discountType);
          setDiscountValue(saved.discountValue);
          setPrepared(saved.prepared);
          setNotice(
            'Đã khôi phục giỏ đang nhập trên thiết bị. Kiểm tra trước khi tiếp tục.',
          );
        }
      })
      .catch(() => {
        if (active)
          setStorageError(
            'Không thể đọc giỏ đã lưu. Bản lưu chưa bị ghi đè; kiểm tra quyền lưu trữ hoặc chủ động bỏ giỏ.',
          );
      })
      .finally(() => {
        if (active) setCartReady(true);
      });
    return () => {
      active = false;
    };
  }, [actorId, initialOrder?.id, initialTableId]);
  useEffect(() => {
    if (!cartReady || storageError) return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        if (
          !lines.length &&
          !prepared &&
          type === 'TAKEAWAY' &&
          discountValue === '0'
        )
          clearWorkingCart(actorId, cartScope, id);
        else
          saveWorkingCart(actorId, cartScope, {
            version: 1,
            id,
            paymentId,
            lines,
            type,
            tableId,
            discountType,
            discountValue,
            prepared,
          });
      })
      .catch(() => {
        if (active)
          setStorageError(
            'Không thể lưu giỏ trên thiết bị. Giỏ vẫn trên màn hình; kiểm tra dung lượng/quyền lưu trữ trước khi tải lại.',
          );
      });
    return () => {
      active = false;
    };
  }, [
    actorId,
    cartScope,
    cartReady,
    storageError,
    id,
    paymentId,
    lines,
    type,
    tableId,
    discountType,
    discountValue,
    prepared,
  ]);
  function discardCart() {
    if (
      !window.confirm(
        'Bỏ giỏ đang nhập trên thiết bị? Đơn đã giữ trên máy chủ/thiết bị không bị hủy; vẫn tìm được trong Đơn hàng.',
      )
    )
      return;
    try {
      clearWorkingCart(actorId, cartScope, storageError ? undefined : id);
      setStorageError('');
    } catch {
      setStorageError('Không thể xóa bản lưu. Kiểm tra quyền lưu trữ.');
      return;
    }
    setCartScope('new');
    setPrepared(null);
    setLines([]);
    setId(crypto.randomUUID());
    setPaymentId(crypto.randomUUID());
    setType('TAKEAWAY');
    setTableId('');
    setDiscountType('PERCENT');
    setDiscountValue('0');
    setPaymentOpen(false);
    setPaid(null);
    setNotice('Đã bỏ giỏ đang nhập. Đơn đã giữ vẫn còn trong Đơn hàng.');
    window.history.replaceState(null, '', '/pos');
  }
  const [recovery, setRecovery] = useState<SaleOrder | null>(null);
  const [stale, setStale] = useState('');
  useEffect(() => {
    if (!prepared || offlineMode || prepared.code.startsWith('TAM-')) return;
    let active = true;
    const update = serialPoll(async () => {
      if (document.hidden) return;
      try {
        const response = await posFetch('/api/orders/' + prepared.id, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error();
        const fresh = await response.json();
        if (active)
          setStale(
            orderViewChanged(prepared, fresh)
              ? 'Đơn đã thay đổi trên thiết bị khác. Giỏ chưa lưu vẫn được giữ; đối chiếu bản mới trước khi thu tiền.'
              : '',
          );
      } catch {
        if (active)
          setStale(
            'Chưa kiểm tra được phiên bản máy chủ. Giỏ vẫn được giữ; hãy kiểm tra kết nối trước khi thu tiền.',
          );
      }
    });
    void update();
    const timer = setInterval(() => void update(), 5000);
    window.addEventListener('focus', update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [prepared, offlineMode]);
  async function recover() {
    setBusy(true);
    try {
      const response = await posFetch('/api/orders/' + id, {
        cache: 'no-store',
      });
      const fresh = await response.json();
      if (!response.ok) throw new Error(fresh.error);
      setRecovery(fresh);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Không thể nạp đơn. Giỏ chưa lưu vẫn được giữ.',
      );
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    !!prepared &&
    (lines.some(
      (l) =>
        !l.snapshot ||
        l.quantity !== l.snapshot.quantity ||
        l.note !== l.snapshot.note,
    ) ||
      type !== prepared.type ||
      (type === 'DINE_IN' && tableId !== prepared.tableId) ||
      parseDiscountInput(discountValue, discountType) !==
        prepared.discountValue ||
      (parseDiscountInput(discountValue, discountType) > 0 &&
        discountType !== prepared.discountType));
  function load(order: SaleOrder) {
    if (order.status !== 'OPEN') {
      try {
        clearWorkingCart(actorId, cartScope, order.id);
      } catch {
        setStorageError('Không thể dọn bản giỏ đã đóng trên thiết bị.');
      }
      setPrepared(null);
      setLines([]);
      setId(crypto.randomUUID());
      setPaymentId(crypto.randomUUID());
      setCartScope('new');
      setTableId('');
      setType('TAKEAWAY');
      setDiscountValue('0');
      setPaymentOpen(false);
      setNotice(orderCompletionMessage(order));
      window.history.replaceState(null, '', '/pos');
      return;
    }
    setPrepared(order);
    setCartScope(order.id);
    window.history.replaceState(null, '', '/pos?orderId=' + order.id);
    setId(order.id);
    setLines(orderLines(order));
    setType(order.type);
    setTableId(order.tableId ?? '');
    setDiscountType(order.discountType ?? 'PERCENT');
    setDiscountValue(String(order.discountValue));
  }
  function details(line: Line) {
    const current = products.find((p) => p.id === line.productId) ?? {
      id: line.productId,
      categoryId: '',
      name: 'Món không còn trong thực đơn',
      imageUrl: null,
      isAvailable: false,
      variants: [],
    };
    const product = line.snapshot
      ? {
          ...current,
          name: line.snapshot.nameSnapshot
            .split(' · ')
            .slice(0, -1)
            .join(' · '),
        }
      : current;
    const variant =
      line.snapshot || product.variants.some((v) => v.id === line.variantId)
        ? orderLineVariant(line, product.variants)
        : { id: line.variantId, name: 'Size không còn bán', price: 0 };
    const selected = line.snapshot
      ? line.snapshot.toppings.map((t) => ({
          id: t.toppingId,
          name: t.nameSnapshot,
          price: t.priceSnapshot,
          isAvailable: true,
        }))
      : toppings.filter((t) => line.toppingIds.includes(t.id));
    return {
      product,
      variant,
      selected,
      money: {
        price: line.snapshot?.priceSnapshot ?? variant.price,
        quantity: line.quantity,
        toppings: selected.map((t) => t.price),
      },
    };
  }
  const discount: Discount = {
    type: discountType,
    value: parseDiscountInput(discountValue, discountType),
  };
  let totals = { subtotal: 0, discount: 0, total: 0 };
  let valid = true;
  try {
    totals = cartTotal(
      lines.map((l) => details(l).money),
      discount,
    );
    if (
      lines.some(
        (line) =>
          !line.snapshot &&
          !products.some(
            (product) =>
              product.isAvailable &&
              product.variants.some((variant) => variant.id === line.variantId),
          ),
      )
    )
      valid = false;
  } catch {
    valid = false;
  }
  const editedProduct = editor
    ? products.find((p) => p.id === editor.productId)
    : null;
  function add(product: MenuProduct) {
    if (
      !cartReady ||
      busy ||
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
  async function checkout(hold = false) {
    if (!cartReady) {
      setError('Đang khôi phục giỏ. Vui lòng chờ một chút.');
      return;
    }
    setPaymentId((current) => tabPaymentId(actorId, id, current));
    const input = checkoutSchema.safeParse({
      id,
      type,
      ...(type === 'DINE_IN' ? { tableId } : {}),
      discount,
      note: prepared?.note ?? '',
      lines: lines.map(
        ({ id: lineId, variantId, quantity, toppingIds, note, snapshot }) => ({
          ...(snapshot ? { itemId: snapshot.id } : {}),
          ...(!snapshot ? { clientLineId: lineId } : {}),
          variantId,
          quantity,
          toppingIds,
          note,
        }),
      ),
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (
        offlineMode ||
        !navigator.onLine ||
        prepared?.code.startsWith('TAM-')
      ) {
        if (prepared && !prepared.code.startsWith('TAM-'))
          throw new Error(
            'Đơn máy chủ cần có mạng để sửa. Hãy tạo đơn mới khi ngoại tuyến.',
          );
        const localInput = {
          ...input.data,
          lines: input.data.lines.map((line) => ({
            ...line,
            itemId: undefined,
          })),
        };
        const order = await prepareLocal(localInput);
        load(order);
        setNotice(hold ? 'Đã giữ trên thiết bị · ' + order.code : '');
        if (!hold) setPaymentOpen(true);
        return;
      }
      const order = await checkoutWithFallback(input.data, prepared);
      if (order.status === 'PAID') {
        setRecovery(order);
        setError(
          'Đơn đã được thanh toán trước đó. Không nhận thêm tiền; kiểm tra hóa đơn.',
        );
        return;
      }
      load(order);
      setNotice(hold ? 'Đã giữ đơn · ' + order.code : '');
      if (!hold) setPaymentOpen(true);
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
    try {
      clearWorkingCart(actorId, cartScope, order.id);
    } catch {
      setStorageError(
        'Đã thanh toán nhưng chưa dọn được bản giỏ đã lưu. Kiểm tra trước khi tiếp tục.',
      );
    }
    setCartScope('new');
    setPaymentId(crypto.randomUUID());
    window.history.replaceState(null, '', '/pos');
    setPaid(order);
    setNotice('');
    setPrepared(null);
    setPaymentOpen(false);
    setLines([]);
    setId(crypto.randomUUID());
    setDiscountValue('0');
    setTableId('');
    setType('TAKEAWAY');
  }
  return (
    <div className="register">
      <h1 className="sr-only">Bán hàng</h1>
      {toolbar &&
        createPortal(
          <div className="register-tools">
            <div className="register-search">
              <Search size={18} aria-hidden="true" />
              <Input
                aria-label="Tìm món"
                placeholder="Tìm món…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="category-tabs" aria-label="Danh mục món">
              {[{ id: '', name: 'Tất cả' }, ...categories].map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <Link
              href="/shifts"
              className={
                'register-shift ' +
                (!hasShift ? 'text-amber-800' : 'text-stone-500')
              }
            >
              <span className={hasShift ? 'bg-emerald-800' : 'bg-amber-600'} />
              {hasShift ? 'Ca đang mở' : 'Mở ca để bán hàng'}
            </Link>
          </div>,
          toolbar,
        )}
      {!cartReady && <p role="status">Đang khôi phục giỏ trên thiết bị…</p>}
      {storageError && (
        <p role="alert" className="rounded-xl bg-red-50 p-3">
          {storageError}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-900"
        >
          {notice}{' '}
          <a href="/orders" className="ml-3 underline">
            Đơn đang giữ
          </a>{' '}
          ·{' '}
          <a href="/pos" className="underline">
            Đơn mới
          </a>
        </p>
      )}
      {prepared && stale && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4">
          {stale}{' '}
          <button
            disabled={busy}
            className="font-bold underline"
            onClick={() => void recover()}
          >
            Đối chiếu (giữ món chưa lưu)
          </button>
        </p>
      )}
      {recovery && (
        <Dialog
          title="Đối chiếu đơn đã thay đổi"
          onClose={() => setRecovery(null)}
        >
          <div className="space-y-4">
            <p>
              Giỏ hiện tại chưa bị xóa. Bản máy chủ {recovery.code} · v
              {recovery.version} · {recovery.status}.
            </p>
            <h3 className="font-bold">Món trên máy chủ</h3>
            {recovery.items
              .filter((i) => i.status === 'ACTIVE')
              .map((i) => (
                <p key={i.id}>
                  {i.quantity} × {i.nameSnapshot} · {i.note}
                </p>
              ))}
            <h3 className="font-bold">Giỏ của bạn (chưa lưu)</h3>
            {lines.map((line) => (
              <p key={line.id}>
                {line.quantity} ×{' '}
                {products.find((p) => p.id === line.productId)?.name ??
                  line.snapshot?.nameSnapshot}{' '}
                · {line.note}
              </p>
            ))}
            {recovery.status === 'OPEN' && prepared ? (
              <>
                <p>
                  Ghép chỉ thêm món/số lượng bạn vừa tăng vào bản mới; không
                  khôi phục món đã hủy. Số lượng cùng một dòng giữ mức lớn nhất
                  để tránh cộng lặp khi máy chủ đã lưu. Ghi chú bạn sửa được ưu
                  tiên. Kiểm tra lại giảm giá và bàn sau khi ghép.
                </p>
                <Button
                  onClick={() => {
                    try {
                      const merged = reapplyPending(prepared, recovery, lines);
                      load(recovery);
                      setLines(merged);
                      setRecovery(null);
                      setError('');
                      setNotice(
                        'Đã ghép món chưa lưu vào bản mới. Kiểm tra rồi Giữ đơn để lưu.',
                      );
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : 'Không thể ghép đơn',
                      );
                    }
                  }}
                >
                  Ghép món chưa lưu vào bản mới
                </Button>
              </>
            ) : (
              <p role="alert">
                Đơn không còn mở. Không thể ghép; giỏ chưa lưu vẫn ở màn hình
                này để kiểm tra.{' '}
                <a
                  className="underline"
                  href={'/pos?orderId=' + recovery.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở trạng thái / hóa đơn / đơn gộp ở cửa sổ mới (giữ giỏ tại
                  đây)
                </a>
              </p>
            )}
          </div>
        </Dialog>
      )}
      {prepared && (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="font-semibold">
            {prepared.code} · Phiên bản {prepared.version} ·{' '}
            {prepared.table?.name ?? 'Mang đi'}
          </p>
          {dirty ? (
            <p className="text-sm text-amber-800">
              Giỏ có thay đổi chưa lưu. Chạm Giữ đơn trước khi
              tách/gộp/chuyển/hủy.
            </p>
          ) : (
            <div className="space-y-3">
              {!prepared.code.startsWith('TAM-') && (
                <PrintLinks id={prepared.id} barOnly />
              )}
              <OrderTools
                order={prepared}
                tables={tables}
                onChange={(order) => {
                  load(order);
                  setNotice(orderCompletionMessage(order));
                }}
              />
            </div>
          )}
        </section>
      )}
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
          {paid.code.startsWith('TAM-') ? (
            <p className="text-sm">
              Đã lưu thanh toán trên thiết bị. Chờ đồng bộ để nhận mã chính thức
              và in lại ở Đơn hàng.
            </p>
          ) : (
            <PrintLinks id={paid.id} />
          )}
        </section>
      )}
      <div className="register-grid">
        <section className="product-area">
          <div className="product-grid">
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
                    busy ||
                    !product.variants.length
                  }
                  onClick={() => add(product)}
                  className={
                    'product-tile ' + (product.imageUrl ? 'product-photo' : '')
                  }
                  data-sold-out={!product.isAvailable}
                  style={{
                    borderLeftColor:
                      categoryColors[
                        Math.max(
                          0,
                          categories.findIndex(
                            (c) => c.id === product.categoryId,
                          ),
                        ) % categoryColors.length
                      ],
                    ...(product.imageUrl
                      ? {
                          backgroundImage:
                            'url(' + JSON.stringify(product.imageUrl) + ')',
                        }
                      : {}),
                  }}
                >
                  <span className="product-name">{product.name}</span>
                  <span className="product-price">
                    {product.isAvailable
                      ? startingPrice(product.variants.map((v) => v.price))
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
        <aside className="register-ticket">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 aria-label="Đơn hiện tại" className="font-semibold">
              {prepared?.code ?? 'Đơn mới'}{' '}
              <span className="text-xs font-normal text-stone-500">
                · {lines.length} món
              </span>
            </h2>
            <button
              type="button"
              disabled={busy || !cartReady}
              onClick={discardCart}
              className="grid h-9 w-9 place-items-center rounded-md text-stone-500 hover:bg-stone-100"
              aria-label="Bỏ giỏ đang nhập (không hủy đơn đã giữ)"
              title="Bỏ giỏ đang nhập (không hủy đơn đã giữ)"
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="mb-3 flex gap-1">
            {(['TAKEAWAY', 'DINE_IN'] as const).map((value) => (
              <button
                key={value}
                disabled={busy}
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={
                  'min-h-10 flex-1 rounded-md border px-3 text-sm font-semibold ' +
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
              disabled={busy}
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
          <div className="ticket-lines">
            {!lines.length && (
              <div className="py-12 text-center text-stone-400">
                <ShoppingBag
                  size={26}
                  className="mx-auto mb-3"
                  aria-hidden="true"
                />
                <p>Chạm vào món để bắt đầu</p>
              </div>
            )}
            {lines.map((line) => {
              const { product, variant, selected, money } = details(line);
              return (
                <div
                  key={line.id}
                  data-testid="cart-line"
                  className="flex items-start justify-between gap-1 border-b border-stone-200 py-3"
                >
                  <button
                    disabled={busy}
                    className="ticket-line"
                    onClick={() => setEditor(line)}
                  >
                    <span className="font-semibold">{line.quantity} ×</span>
                    <span>
                      <span className="block font-semibold">
                        {product.name}{' '}
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
                    </span>
                    <span className="ticket-amount">
                      {formatVnd(lineTotal(money))}
                    </span>
                  </button>
                  <button
                    disabled={busy || !!line.snapshot}
                    aria-label={'Xóa ' + product.name}
                    className="flex h-10 w-6 shrink-0 items-center justify-center text-stone-400 hover:text-red-700 disabled:opacity-30"
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
          <div className="ticket-footer">
            <div className="mb-3 flex justify-between text-sm text-stone-500">
              <span>Tạm tính</span>
              <span>{formatVnd(totals.subtotal)}</span>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <label htmlFor="discount" className="flex-1 text-sm">
                Giảm giá
              </label>
              <MoneyInput
                id="discount"
                aria-label="Giảm giá"
                grouped={discountType === 'AMOUNT'}
                min={0}
                step={1}
                disabled={busy}
                value={discountValue}
                onValueChange={setDiscountValue}
                className="w-24"
              />
              <select
                aria-label="Kiểu giảm giá"
                disabled={busy}
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
                Món đã giữ: dùng Hủy món + PIN để giảm hoặc xóa.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
              >
                {error}{' '}
                {error.includes('tải lại') && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void recover()}
                    className="font-bold underline"
                  >
                    Tải bản mới, giữ món chưa lưu
                  </button>
                )}
              </p>
            )}
            {!valid && (
              <p role="alert" className="mb-3 text-sm text-red-700">
                Giảm giá hoặc món trong giỏ không còn hợp lệ. Kiểm tra lại thực
                đơn.
              </p>
            )}
            <div className="ticket-actions">
              <Button
                className="order-2 text-sm"
                aria-label={busy ? 'Đang chốt đơn…' : 'Thanh toán'}
                disabled={busy || !hasShift || !lines.length || !valid}
                onClick={() => checkout()}
              >
                {busy ? (
                  'Đang chốt đơn…'
                ) : (
                  <>
                    Thanh toán{' '}
                    <span className="ml-2">{formatVnd(totals.total)}</span>
                  </>
                )}
              </Button>
              <Button
                className="order-1 border border-stone-300 bg-white text-sm text-stone-700 hover:bg-stone-50"
                aria-label="Giữ đơn / Tạm tính"
                disabled={busy || !hasShift || !lines.length || !valid}
                onClick={() => checkout(true)}
              >
                Giữ đơn
              </Button>
            </div>
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
                      disabled={!!editor.snapshot}
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
                {toppings
                  .filter((t) => {
                    const product = products.find(
                      (p) => p.id === editor.productId,
                    );
                    return (
                      !product?.toppings ||
                      product.toppings.some((allowed) => allowed.id === t.id)
                    );
                  })
                  .map((topping) => (
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
                        disabled={!topping.isAvailable || !!editor.snapshot}
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
                  disabled={editor.quantity <= (editor.snapshot?.quantity ?? 1)}
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
          paymentId={paymentId}
          order={prepared}
          bank={bank}
          onPaid={complete}
          onClose={() => setPaymentOpen(false)}
        />
      )}
    </div>
  );
}
