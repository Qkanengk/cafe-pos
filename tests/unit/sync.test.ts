import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    aggregate: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    orders: new Map<string, Record<string, unknown>>(),
    db: {
      order: model(),
      orderSequence: model(),
      payment: model(),
      user: model(),
      shift: model(),
      productVariant: model(),
      topping: model(),
      table: model(),
      orderItem: model(),
      orderItemTopping: model(),
      auditLog: model(),
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    },
  };
});
vi.mock('../../lib/db', () => ({ db: mocks.db }));
import { syncOrder } from '../../lib/sync';
import { syncSchema, syncEntrySchema } from '../../lib/sync-validation';
import { signCatalog, verifyCatalog } from '../../lib/offline-catalog';
import { vietnamDay } from '../../lib/sales';
const userId = '11111111-1111-4111-8111-111111111111',
  storeId = '22222222-2222-4222-8222-222222222222',
  id = '33333333-3333-4333-8333-333333333333',
  paymentId = '44444444-4444-4444-8444-444444444444',
  shiftId = '55555555-5555-4555-8555-555555555555';
const actor = { id: userId, storeId };
const catalog = {
  userId,
  storeId,
  products: [
    {
      id,
      categoryId: id,
      name: 'Cà phê',
      imageUrl: null,
      isAvailable: true,
      variants: [{ id, name: 'M', price: 25000 }],
    },
  ],
  toppings: [{ id, name: 'Kem', price: 5000, isAvailable: true }],
};
function entry() {
  return syncEntrySchema.parse({
    userId,
    shiftId,
    paymentId,
    createdAt: new Date(Date.now() - 10000).toISOString(),
    paidAt: new Date().toISOString(),
    catalogToken: signCatalog(catalog),
    order: {
      id,
      type: 'TAKEAWAY',
      lines: [{ variantId: id, quantity: 2, toppingIds: [id], note: 'ít đá' }],
    },
    payment: { method: 'CASH', received: 100000 },
  });
}
function recoveredOrder(input = entry()) {
  return {
    id,
    storeId,
    createdBy: userId,
    shiftId,
    status: 'OPEN',
    version: 1,
    payments: [],
    type: 'TAKEAWAY',
    tableId: null,
    note: '',
    discountType: null,
    discountValue: 0,
    subtotal: 60000,
    total: 60000,
    businessDate: vietnamDay(new Date(input.paidAt)),
    code: 'CF001',
    dailyNumber: 1,
    items: [
      {
        id: 'saved-item',
        variantId: id,
        quantity: 2,
        note: 'ít đá',
        status: 'ACTIVE',
        priceSnapshot: 25000,
        toppings: [{ toppingId: id, priceSnapshot: 5000 }],
      },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('AUTH_SECRET', 'unit-test-secret-at-least-32-characters');
  mocks.orders.clear();
  const orders = mocks.orders,
    payments = new Map<string, Record<string, unknown>>();
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
  mocks.db.user.findFirst.mockResolvedValue(actor);
  mocks.db.shift.findFirst.mockResolvedValue({
    id: shiftId,
    openedAt: new Date(Date.now() - 60000),
    closedAt: null,
  });
  mocks.db.order.findUnique.mockImplementation(
    async ({ where }) => orders.get(where.id) ?? null,
  );
  mocks.db.payment.findUnique.mockImplementation(
    async ({ where }) => payments.get(where.id) ?? null,
  );
  mocks.db.order.aggregate.mockResolvedValue({ _max: { dailyNumber: 4 } });
  mocks.db.orderSequence.upsert.mockResolvedValue({ lastNumber: 5 });
  mocks.db.order.create.mockImplementation(async ({ data }) => {
    const order = { ...data, payments: [] };
    orders.set(data.id, order);
    return order;
  });
  mocks.db.order.update.mockImplementation(async ({ where, data }) => {
    const order = { ...orders.get(where.id), ...data, payments: [] };
    orders.set(where.id, order);
    return order;
  });
  mocks.db.payment.create.mockImplementation(async ({ data }) => {
    payments.set(data.id, data);
    orders.get(data.orderId)!.payments = [data];
    return data;
  });
  mocks.db.productVariant.findMany.mockResolvedValue([{ id }]);
  mocks.db.topping.findMany.mockResolvedValue([{ id }]);
  mocks.db.table.findFirst.mockResolvedValue({ id });
  mocks.db.orderItem.create.mockResolvedValue({ id: 'item' });
});
describe('offline sync transaction', () => {
  it('rejects an add-on outside the signed product allowlist', async () => {
    const payload = entry();
    payload.catalogToken = signCatalog({
      ...catalog,
      products: catalog.products.map((product) => ({
        ...product,
        toppings: [],
      })),
    });
    await expect(syncOrder(actor, payload)).rejects.toThrow(
      'Topping không dùng cho món này',
    );
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });
  it('accepts a product configured with no toppings when none were selected', async () => {
    const payload = entry();
    payload.order.lines[0].toppingIds = [];
    payload.catalogToken = signCatalog({
      ...catalog,
      products: catalog.products.map((product) => ({
        ...product,
        toppings: [],
      })),
    });
    await expect(syncOrder(actor, payload)).resolves.toMatchObject({
      id: payload.order.id,
    });
  });
  it('pays a matching committed order without replacing its lines after the response was lost', async () => {
    const input = entry();
    mocks.orders.set(id, {
      id,
      storeId,
      createdBy: userId,
      shiftId,
      status: 'OPEN',
      version: 1,
      payments: [],
      requestHash: createHash('sha256')
        .update(JSON.stringify(input.order))
        .digest('hex'),
      type: 'TAKEAWAY',
      tableId: null,
      note: '',
      discountType: null,
      discountValue: 0,
      total: 60000,
      subtotal: 60000,
      businessDate: vietnamDay(new Date(input.paidAt)),
      dailyNumber: 1,
      code: 'CF001',
      items: [
        {
          id: 'saved-item',
          variantId: id,
          quantity: 2,
          note: 'ít đá',
          status: 'ACTIVE',
          priceSnapshot: 25000,
          toppings: [{ toppingId: id, priceSnapshot: 5000 }],
        },
      ],
    });
    await syncOrder(actor, input);
    await syncOrder(actor, input);
    expect(mocks.db.order.create).not.toHaveBeenCalled();
    expect(mocks.db.order.update).toHaveBeenCalledTimes(1);
    expect(mocks.db.payment.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.orderItem.create).not.toHaveBeenCalled();
    expect(mocks.db.orderItem.deleteMany).not.toHaveBeenCalled();
  });
  it('honors the signed sale-time price even after live catalog prices change', async () => {
    mocks.db.productVariant.findMany.mockResolvedValue([{ id, price: 99000 }]);
    await syncOrder(actor, entry());
    expect(mocks.db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ subtotal: 60000, total: 60000 }),
    });
  });
  it('renumbers a recovered checkout on its payment day and preserves the code on replay', async () => {
    const input = entry(),
      existing = recoveredOrder(input);
    existing.businessDate = vietnamDay(
      new Date(new Date(input.paidAt).getTime() - 86400000),
    );
    existing.code = 'CF' + existing.businessDate.replaceAll('-', '') + '-0001';
    mocks.orders.set(id, existing);
    const result = await syncOrder(actor, input);
    await expect(syncOrder(actor, input)).resolves.toEqual(result);
    expect(mocks.db.order.update).toHaveBeenCalledWith({
      where: { id },
      data: expect.objectContaining({
        businessDate: vietnamDay(new Date(input.paidAt)),
        code:
          'CF' +
          vietnamDay(new Date(input.paidAt)).replaceAll('-', '') +
          '-0005',
      }),
    });
    expect(mocks.db.payment.create).toHaveBeenCalledTimes(1);
  });
  it('rejects offsetting per-line price changes even when the recovered totals match', async () => {
    const input = entry(),
      existing = recoveredOrder(input);
    existing.items[0].priceSnapshot = 20000;
    existing.items[0].toppings[0].priceSnapshot = 10000;
    mocks.orders.set(id, existing);
    await expect(syncOrder(actor, input)).rejects.toThrow('giá từng món');
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });
  it('upserts by order/payment UUID; replay writes exactly one paid order and payment', async () => {
    const input = entry(),
      first = await syncOrder(actor, input),
      replay = await syncOrder(actor, input);
    expect(replay).toEqual(first);
    expect(first.code).toMatch(/-0005$/);
    expect(mocks.db.order.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.payment.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id,
        status: 'PAID',
        total: 60000,
        businessDate: vietnamDay(new Date(input.paidAt)),
        shiftId,
      }),
    });
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: paymentId,
        amount: 60000,
        received: 100000,
        change: 40000,
        confirmedBy: userId,
      }),
    });
    expect(mocks.db.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nameSnapshot: 'Cà phê · M',
        priceSnapshot: 25000,
        note: 'ít đá',
      }),
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('rejects changed payload for an existing UUID without another write', async () => {
    const input = entry();
    await syncOrder(actor, input);
    await expect(
      syncOrder(actor, {
        ...input,
        payment: { method: 'CASH', received: 200000 },
      }),
    ).rejects.toThrow('UUID đã dùng');
    expect(mocks.db.payment.create).toHaveBeenCalledTimes(1);
  });
  it('does not reuse a payment UUID on a different order', async () => {
    const input = entry();
    await syncOrder(actor, input);
    await expect(
      syncOrder(actor, { ...input, order: { ...input.order, id: paymentId } }),
    ).rejects.toThrow('thanh toán đã tồn tại');
    expect(mocks.db.order.create).toHaveBeenCalledTimes(1);
  });
  it('supports local VietQR/manual bank confirmation', async () => {
    await syncOrder(actor, {
      ...entry(),
      payment: { method: 'BANK_TRANSFER', confirmed: true },
    });
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'BANK_TRANSFER',
        received: null,
        change: null,
        amount: 60000,
      }),
    });
  });
  it('rejects empty batches/lines and unconfirmed bank payments', () => {
    expect(syncSchema.safeParse({ entries: [] }).success).toBe(false);
    const input = entry();
    expect(
      syncEntrySchema.safeParse({
        ...input,
        order: { ...input.order, lines: [] },
      }).success,
    ).toBe(false);
    expect(
      syncEntrySchema.safeParse({
        ...input,
        payment: { method: 'BANK_TRANSFER', confirmed: false },
      }).success,
    ).toBe(false);
  });
  it('rejects other users and forged catalog snapshots', async () => {
    await expect(
      syncOrder({ ...actor, id: paymentId }, entry()),
    ).rejects.toThrow('nhân viên khác');
    const input = entry();
    await expect(
      syncOrder(actor, { ...input, catalogToken: input.catalogToken + 'x' }),
    ).rejects.toThrow('không hợp lệ');
    expect(mocks.db.order.create).not.toHaveBeenCalled();
    expect(() =>
      verifyCatalog(signCatalog({ ...catalog, userId: paymentId }), actor),
    ).toThrow('phiên nhân viên');
  });
  it('rejects insufficient cash, missing products and inactive users without writes', async () => {
    await expect(
      syncOrder(actor, {
        ...entry(),
        payment: { method: 'CASH', received: 1 },
      }),
    ).rejects.toThrow('Insufficient cash');
    mocks.db.productVariant.findMany.mockResolvedValue([]);
    await expect(syncOrder(actor, entry())).rejects.toThrow('Món đã bị xóa');
    mocks.db.user.findFirst.mockResolvedValue(null);
    await expect(syncOrder(actor, entry())).rejects.toThrow('ngừng hoạt động');
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });
  it('accepts delayed delivery into the original closed shift only if sold before close', async () => {
    const input = entry();
    mocks.db.shift.findFirst.mockResolvedValue({
      id: shiftId,
      openedAt: new Date(Date.now() - 60000),
      closedAt: new Date(Date.now() + 1000),
    });
    await syncOrder(actor, input);
    const other = {
      ...entry(),
      order: { ...entry().order, id: paymentId },
      paymentId: id,
    };
    mocks.db.shift.findFirst.mockResolvedValue({
      id: shiftId,
      openedAt: new Date(Date.now() - 60000),
      closedAt: new Date(Date.now() - 20000),
    });
    await expect(syncOrder(actor, other)).rejects.toThrow('Thời gian bán');
  });
});
