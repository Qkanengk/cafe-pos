import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    aggregate: vi.fn(),
    update: vi.fn(),
  });
  const db = {
    order: model(),
    user: model(),
    shift: model(),
    table: model(),
    productVariant: model(),
    topping: model(),
    orderItem: model(),
    orderItemTopping: model(),
    payment: model(),
    auditLog: model(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { db };
});
vi.mock('../../lib/db', () => ({ db: mocks.db }));
import { prepareOrder, payOrder, vietnamDay } from '../../lib/sales';
import { checkoutSchema } from '../../lib/sales-validation';
const actor = { id: 'user', storeId: 'store' };
const id = '7ff9e456-8548-4f88-9c18-1d2b655de2ce';
const input = checkoutSchema.parse({
  id,
  type: 'TAKEAWAY',
  lines: [{ variantId: id, quantity: 2, toppingIds: [id], note: 'ít đá' }],
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
  mocks.db.user.findFirst.mockResolvedValue(actor);
  mocks.db.shift.findFirst.mockResolvedValue({ id: 'shift' });
  mocks.db.order.findUnique.mockResolvedValue(null);
  mocks.db.order.aggregate.mockResolvedValue({ _max: { dailyNumber: 8 } });
  mocks.db.order.create.mockImplementation(async ({ data }) => data);
  mocks.db.orderItem.create.mockResolvedValue({ id: 'item' });
  mocks.db.productVariant.findMany.mockResolvedValue([
    {
      id,
      productId: 'product',
      name: 'M',
      price: 30000,
      product: { name: 'Latte', isAvailable: true },
    },
  ]);
  mocks.db.topping.findMany.mockResolvedValue([
    { id, name: 'Kem', price: 5000, isAvailable: true },
  ]);
  mocks.db.order.findUniqueOrThrow.mockResolvedValue({ id, status: 'OPEN' });
  mocks.db.order.findFirst.mockResolvedValue({
    id,
    storeId: 'store',
    createdBy: 'user',
    status: 'OPEN',
    shiftId: 'shift',
    total: 70000,
    version: 1,
  });
});
describe('server sales', () => {
  it('audits an applied discount when collecting payment', async () => {
    mocks.db.order.findFirst.mockResolvedValue({
      id,
      storeId: 'store',
      status: 'OPEN',
      shiftId: 'shift',
      version: 1,
      subtotal: 80000,
      total: 70000,
      discountType: 'AMOUNT',
      discountValue: 10000,
    });
    await payOrder(actor, id, { method: 'CASH', received: 100000 });
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DISCOUNT',
        entityId: id,
        data: expect.objectContaining({ amount: 10000 }),
      }),
    });
  });
  it('uses Vietnam day at UTC date boundaries', () => {
    expect(vietnamDay(new Date('2026-11-23T18:00:00Z'))).toBe('2026-11-24');
    expect(vietnamDay(new Date('2026-11-23T16:59:59Z'))).toBe('2026-11-23');
  });
  it('prices from server menu and persists names, prices, note and daily sequence', async () => {
    await prepareOrder(actor, input);
    expect(mocks.db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id,
        subtotal: 70000,
        total: 70000,
        dailyNumber: 9,
        code: expect.stringMatching(/^CF[0-9]{8}-0009$/),
      }),
    });
    expect(mocks.db.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nameSnapshot: 'Latte · M',
        priceSnapshot: 30000,
        quantity: 2,
        note: 'ít đá',
      }),
    });
    expect(mocks.db.orderItemTopping.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ nameSnapshot: 'Kem', priceSnapshot: 5000 }),
      ],
    });
  });
  it('replays identical order IDs without duplicate writes, rejects changed contents', async () => {
    await prepareOrder(actor, input);
    const data = mocks.db.order.create.mock.calls[0][0].data;
    mocks.db.order.findUnique.mockResolvedValue({ ...data, status: 'OPEN' });
    await prepareOrder(actor, input);
    expect(mocks.db.order.create).toHaveBeenCalledTimes(1);
    await expect(
      prepareOrder(actor, { ...input, note: 'changed' }),
    ).rejects.toThrow('nội dung khác');
    await expect(
      prepareOrder({ ...actor, storeId: 'other' }, input),
    ).rejects.toThrow('Mã đơn không hợp lệ');
  });
  it('requires an open shift and available same-store menu entries', async () => {
    mocks.db.shift.findFirst.mockResolvedValueOnce(null);
    await expect(prepareOrder(actor, input)).rejects.toThrow('mở ca');
    mocks.db.productVariant.findMany.mockResolvedValueOnce([]);
    await expect(prepareOrder(actor, input)).rejects.toThrow('hết hàng');
    expect(mocks.db.productVariant.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
    mocks.db.topping.findMany.mockResolvedValueOnce([]);
    await expect(prepareOrder(actor, input)).rejects.toThrow('topping');
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });
  it('requires an active actor and a valid table', async () => {
    mocks.db.user.findFirst.mockResolvedValueOnce(null);
    await expect(prepareOrder(actor, input)).rejects.toThrow('hiệu lực');
    mocks.db.table.findFirst.mockResolvedValue(null);
    await expect(
      prepareOrder(actor, { ...input, type: 'DINE_IN', tableId: id }),
    ).rejects.toThrow('Bàn');
  });
  it('records cash tender, exact change and the confirming cashier', async () => {
    await payOrder(actor, id, { method: 'CASH', received: 100000 });
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store',
        orderId: id,
        method: 'CASH',
        amount: 70000,
        received: 100000,
        change: 30000,
        confirmedBy: 'user',
      },
    });
    expect(mocks.db.order.update).toHaveBeenCalledWith({
      where: { id },
      data: expect.objectContaining({
        status: 'PAID',
        version: { increment: 1 },
      }),
    });
  });
  it('records bank confirmation without cash tender or change', async () => {
    const paymentId = '77777777-7777-4777-8777-777777777777';
    await payOrder(actor, id, {
      id: paymentId,
      method: 'BANK_TRANSFER',
      confirmed: true,
    });
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'BANK_TRANSFER',
        id: paymentId,
        received: null,
        change: null,
        confirmedBy: 'user',
      }),
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalled();
  });
  it('does not take a second payment on retry, even after shift closure', async () => {
    const paymentId = '77777777-7777-4777-8777-777777777777';
    mocks.db.order.findFirst.mockResolvedValue({
      id,
      status: 'PAID',
      payments: [
        {
          id: paymentId,
          method: 'CASH',
          received: 100000,
          confirmedBy: actor.id,
        },
      ],
    });
    mocks.db.shift.findFirst.mockResolvedValue(null);
    await payOrder(actor, id, {
      id: paymentId,
      method: 'CASH',
      received: 100000,
    });
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });
  it('rejects a competing payment and exposes the existing paid result, not a false success', async () => {
    const paid = {
      id,
      status: 'PAID',
      payments: [
        { id: 'first', method: 'CASH', received: 30000, confirmedBy: actor.id },
      ],
    };
    mocks.db.order.findFirst.mockResolvedValue(paid);
    for (const payment of [
      { id: 'second', method: 'CASH' as const, received: 50000 },
      { id: 'first', method: 'CASH' as const, received: 50000 },
      { method: 'CASH' as const, received: 30000 },
    ])
      await expect(payOrder(actor, id, payment)).rejects.toMatchObject({
        status: 409,
        details: { order: paid },
      });
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });
  it('rejects short tender, closed shifts and missing orders without payment', async () => {
    await expect(
      payOrder(actor, id, { method: 'CASH', received: 1 }),
    ).rejects.toThrow('Insufficient cash');
    mocks.db.shift.findFirst.mockResolvedValueOnce(null);
    await expect(
      payOrder(actor, id, { method: 'CASH', received: 100000 }),
    ).rejects.toThrow('Ca đã đóng');
    mocks.db.order.findFirst.mockResolvedValueOnce(null);
    await expect(
      payOrder(actor, id, { method: 'BANK_TRANSFER', confirmed: true }),
    ).rejects.toThrow('Không tìm thấy');
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });
});
