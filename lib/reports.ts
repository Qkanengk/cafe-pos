import { z } from 'zod';
import {
  cartTotal,
  discountAmount,
  lineTotal,
  averageTicket,
  netLineRevenues,
  sumLedger,
} from './money';
export function businessDay(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T00:00:00+07:00');
    return !Number.isNaN(d.getTime()) && businessDay(d) === s;
  }, 'Ngày không hợp lệ');
export function reportRange(from = businessDay(new Date()), to = from) {
  const parsed = z.object({ from: day, to: day }).parse({ from, to });
  const start = new Date(parsed.from + 'T00:00:00+07:00'),
    end = new Date(
      new Date(parsed.to + 'T00:00:00+07:00').getTime() + 86400000,
    );
  if (start >= end || end.getTime() - start.getTime() > 366 * 86400000)
    throw new RangeError('Chọn khoảng ngày hợp lệ, tối đa 366 ngày');
  return { ...parsed, start, end };
}
export type ReportOrder = {
  id: string;
  code: string;
  status: string;
  shiftId: string;
  total: number;
  paidAt: Date | null;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number;
  shift: { id: string; openedAt: Date; opener: { name: string } };
  payments: {
    method: string;
    amount: number;
    createdAt?: Date;
    shiftId?: string;
    shift?: { id: string; openedAt: Date; opener: { name: string } };
  }[];
  refunds?: {
    createdAt: Date;
    items: { itemId: string; quantity: number; amount: number }[];
  }[];
  items: {
    id: string;
    productId: string;
    product?: { name: string } | null;
    nameSnapshot: string;
    quantity: number;
    priceSnapshot: number;
    status: 'ACTIVE' | 'VOIDED';
    voidReason: string | null;
    toppings: { priceSnapshot: number }[];
  }[];
};
export type ReportAudit = {
  id: string;
  entityId: string;
  action: string;
  createdAt: Date;
  data: unknown;
};
type Bucket = { label: string; revenue: number; count: number };
export function buildReport(
  orders: ReportOrder[],
  audits: ReportAudit[],
  owners: { id: string; name: string }[],
  range: ReturnType<typeof reportRange>,
) {
  const paid = orders.filter(
    (o) =>
      o.status === 'PAID' &&
      o.paidAt &&
      o.paidAt >= range.start &&
      o.paidAt < range.end,
  );
  const returned = orders.flatMap((order) =>
    order.payments
      .filter(
        (p) =>
          p.amount < 0 &&
          p.createdAt &&
          p.createdAt >= range.start &&
          p.createdAt < range.end,
      )
      .map((payment) => ({ order, payment })),
  );
  const revenue = sumLedger([
      ...paid.map((o) => o.total),
      ...returned.map((r) => r.payment.amount),
    ]),
    count = paid.length;
  const days = new Map<string, Bucket>(),
    shifts = new Map<string, Bucket>(),
    methods = new Map<string, Bucket>();
  const items = new Map<
    string,
    { id: string; name: string; quantity: number; revenue: number }
  >();
  function add(
    map: Map<string, Bucket>,
    key: string,
    label: string,
    amount: number,
    count = 1,
  ) {
    const prior = map.get(key) ?? { label, revenue: 0, count: 0 };
    map.set(key, {
      label,
      revenue: sumLedger([prior.revenue, amount]),
      count: prior.count + count,
    });
  }
  for (const order of paid) {
    add(
      days,
      businessDay(order.paidAt!),
      businessDay(order.paidAt!),
      order.total,
    );
    add(
      shifts,
      order.shiftId,
      order.shift.opener.name +
        ' · ' +
        new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(order.shift.openedAt),
      order.total,
    );
    const seenMethods = new Set<string>();
    for (const p of order.payments.filter((p) => p.amount >= 0)) {
      add(
        methods,
        p.method,
        p.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản',
        p.amount,
        seenMethods.has(p.method) ? 0 : 1,
      );
      seenMethods.add(p.method);
    }
    const active = order.items.filter((i) => i.status === 'ACTIVE');
    const lines = active.map((i) => ({
      price: i.priceSnapshot,
      quantity: i.quantity,
      toppings: i.toppings.map((t) => t.priceSnapshot),
    }));
    const totals = cartTotal(lines);
    const net = netLineRevenues(
      lines,
      discountAmount(
        totals.subtotal,
        order.discountType
          ? { type: order.discountType, value: order.discountValue }
          : undefined,
      ),
    );
    active.forEach((item, index) => {
      const prior = items.get(item.productId) ?? {
        id: item.productId,
        name:
          item.product?.name ??
          item.nameSnapshot.split(' · ').slice(0, -1).join(' · '),
        quantity: 0,
        revenue: 0,
      };
      items.set(item.productId, {
        ...prior,
        quantity: prior.quantity + item.quantity,
        revenue: sumLedger([prior.revenue, net[index]]),
      });
    });
  }
  for (const { order, payment: p } of returned) {
    const day = businessDay(p.createdAt!);
    add(days, day, day, p.amount, 0);
    const shift = p.shift ?? order.shift;
    add(
      shifts,
      p.shiftId ?? order.shiftId,
      shift.opener.name +
        ' · ' +
        shift.openedAt.toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
        }),
      p.amount,
      0,
    );
    add(
      methods,
      p.method,
      p.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản',
      p.amount,
      0,
    );
  }
  for (const order of orders)
    for (const refund of order.refunds ?? [])
      if (refund.createdAt >= range.start && refund.createdAt < range.end)
        for (const line of refund.items) {
          const item = order.items.find((i) => i.id === line.itemId);
          if (!item) continue;
          const prior = items.get(item.productId) ?? {
            id: item.productId,
            name: item.product?.name ?? item.nameSnapshot,
            quantity: 0,
            revenue: 0,
          };
          items.set(item.productId, {
            ...prior,
            quantity: prior.quantity - line.quantity,
            revenue: sumLedger([prior.revenue, -line.amount]),
          });
        }
  const voids = audits
    .filter(
      (a) =>
        a.createdAt >= range.start &&
        a.createdAt < range.end &&
        ['VOID', 'CANCEL'].includes(a.action),
    )
    .flatMap((a) => {
      const order = orders.find((o) => o.id === a.entityId);
      if (!order) return [];
      const data = a.data as {
        itemId?: string;
        ownerId?: string;
        reason?: string;
      };
      if (!data || typeof data !== 'object') return [];
      return order.items
        .filter((item) =>
          a.action === 'VOID'
            ? item.id === data.itemId
            : item.status === 'VOIDED' &&
              !audits.some((previous) => {
                const details = previous.data as { itemId?: string } | null;
                return (
                  previous.entityId === order.id &&
                  previous.action === 'VOID' &&
                  previous.createdAt <= a.createdAt &&
                  details?.itemId === item.id
                );
              }),
        )
        .map((item) => ({
          id: a.id + '-' + item.id,
          shiftId: order.shiftId,
          shift:
            order.shift.opener.name + ' · ' + businessDay(order.shift.openedAt),
          code: order.code,
          item: item.nameSnapshot,
          quantity: item.quantity,
          amount: lineTotal({
            price: item.priceSnapshot,
            quantity: item.quantity,
            toppings: item.toppings.map((t) => t.priceSnapshot),
          }),
          reason: data.reason ?? item.voidReason ?? '',
          owner:
            owners.find((u) => u.id === data.ownerId)?.name ?? 'Không xác định',
          action: a.action,
          at: a.createdAt.toISOString(),
        }));
    });
  return {
    from: range.from,
    to: range.to,
    revenue,
    count,
    average: averageTicket(revenue, count),
    days: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, ...v })),
    shifts: [...shifts].map(([id, v]) => ({ id, ...v })),
    methods: [...methods].map(([id, v]) => ({ id, ...v })),
    topQuantity: [...items.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 10),
    topRevenue: [...items.values()]
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .slice(0, 10),
    voids,
  };
}
