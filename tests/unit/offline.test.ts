import { beforeEach, describe, it, expect, vi } from 'vitest';
const mem = vi.hoisted(() => {
  const table = () => {
    const rows = new Map<string, Record<string, unknown>>();
    return {
      rows,
      get: vi.fn(async (id: string) => rows.get(id)),
      put: vi.fn(async (value: Record<string, unknown>) =>
        rows.set(value.id as string, structuredClone(value)),
      ),
      add: vi.fn(async (value: Record<string, unknown>) => {
        if (rows.has(value.id as string)) throw Error('duplicate');
        rows.set(value.id as string, structuredClone(value));
      }),
      delete: vi.fn(async (id: string) => rows.delete(id)),
      update: vi.fn(async (id: string, value: Record<string, unknown>) => {
        const old = rows.get(id);
        if (old) rows.set(id, { ...old, ...value });
      }),
      where: (field: string) => ({
        equals: (value: string) => {
          const all = () =>
            [...rows.values()].filter((row) => row[field] === value);
          return {
            toArray: async () => all(),
            limit: (n: number) => ({ toArray: async () => all().slice(0, n) }),
          };
        },
      }),
    };
  };
  const db = {
    snapshots: table(),
    drafts: table(),
    outbox: table(),
    receipts: table(),
    version: () => ({ stores: () => {} }),
    transaction: async (...args: unknown[]) =>
      (args.at(-1) as () => Promise<unknown>)(),
  };
  return { db };
});
vi.mock('dexie', () => ({
  default: class {
    constructor() {
      Object.assign(this, mem.db);
    }
  },
}));
import { prepareLocal, payLocal, refreshSnapshot } from '../../lib/offline';
import type { OfflineSnapshot } from '../../lib/offline-types';
import { checkoutSchema } from '../../lib/sales-validation';
const id = '11111111-1111-4111-8111-111111111111';
function snapshot(): OfflineSnapshot {
  return {
    user: { id: 'cashier', storeId: 'store', name: 'Lan', role: 'CASHIER' },
    validUntil: Date.now() + 60000,
    products: [
      {
        id,
        categoryId: id,
        name: 'Coffee',
        imageUrl: null,
        isAvailable: true,
        variants: [{ id, name: 'M', price: 25000 }],
      },
    ],
    toppings: [],
    categories: [],
    tables: [],
    store: {
      name: 'Cafe',
      bankBin: '970436',
      bankAccount: '123',
      bankAccountName: 'Cafe',
    },
    shift: { id: 'original-shift', openedAt: new Date().toISOString() },
    catalogToken: 'old-signed-catalog',
  };
}
function input() {
  return checkoutSchema.parse({
    id,
    type: 'TAKEAWAY',
    lines: [{ variantId: id, quantity: 1 }],
  });
}
beforeEach(() => {
  for (const table of [
    mem.db.snapshots,
    mem.db.drafts,
    mem.db.outbox,
    mem.db.receipts,
  ])
    table.rows.clear();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn());
  mem.db.snapshots.rows.set('active', { id: 'active', data: snapshot() });
});
describe('local sale snapshots', () => {
  it('keeps the exact pricing catalog and shift when menu refreshes before payment', async () => {
    const order = await prepareLocal(input());
    const newer = snapshot();
    newer.catalogToken = 'new-signed-catalog';
    newer.products[0].variants[0].price = 50000;
    newer.shift!.id = 'new-shift';
    vi.mocked(fetch).mockResolvedValue(Response.json(newer));
    await refreshSnapshot();
    const paid = await payLocal(order, { method: 'CASH', received: 30000 });
    expect(paid.total).toBe(25000);
    expect(paid.payments[0].change).toBe(5000);
    expect(mem.db.outbox.rows.get(id)).toMatchObject({
      entry: { catalogToken: 'old-signed-catalog', shiftId: 'original-shift' },
    });
  });
  it('rejects missing drafts rather than queueing an unpriced sale', async () => {
    const order = await prepareLocal(input());
    mem.db.drafts.rows.clear();
    await expect(
      payLocal(order, { method: 'CASH', received: 30000 }),
    ).rejects.toThrow('Không tìm thấy');
    expect(mem.db.outbox.rows.size).toBe(0);
  });
  it('rejects legacy drafts without a sale-time catalog instead of using current prices', async () => {
    const order = await prepareLocal(input());
    delete mem.db.drafts.rows.get(id)!.catalogToken;
    await expect(
      payLocal(order, { method: 'BANK_TRANSFER', confirmed: true }),
    ).rejects.toThrow('thiếu bảng giá');
  });
});
