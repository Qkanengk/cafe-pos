import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
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
    updateMany: vi.fn(),
  });
  return {
    db: {
      order: model(),
      orderItem: model(),
      orderItemTopping: model(),
      shift: model(),
      user: model(),
      table: model(),
      topping: model(),
      productVariant: model(),
      auditLog: model(),
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    },
    compare: vi.fn(),
  };
});
vi.mock('../../lib/db', () => ({ db: mocks.db }));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));
import {
  operateOrder,
  editOrder,
  checkVersion,
} from '../../lib/order-management';
import { checkoutSchema } from '../../lib/sales-validation';
import { pinLimiter } from '../../lib/pin-limit';
const id = '7ff9e456-8548-4f88-9c18-1d2b655de2ce';
const itemId = '8ff9e456-8548-4f88-9c18-1d2b655de2ce';
const otherItemId = '9ff9e456-8548-4f88-9c18-1d2b655de2ce';
const actor = { id: 'cashier', storeId: 'store' };
function fixture() {
  return {
    id,
    version: 1,
    status: 'OPEN',
    storeId: 'store',
    shiftId: 'shift',
    tableId: 'table',
    type: 'DINE_IN',
    subtotal: 90000,
    total: 90000,
    discountType: null as string | null,
    discountValue: 0,
    note: '',
    items: [
      {
        id: itemId,
        orderId: id,
        storeId: 'store',
        productId: id,
        variantId: id,
        nameSnapshot: 'Latte · M',
        priceSnapshot: 30000,
        quantity: 2,
        status: 'ACTIVE',
        note: 'ít đá',
        toppings: [
          {
            id: 'top',
            toppingId: id,
            nameSnapshot: 'Kem',
            priceSnapshot: 5000,
          },
        ],
      },
      {
        id: otherItemId,
        orderId: id,
        storeId: 'store',
        productId: id,
        variantId: id,
        nameSnapshot: 'Trà · M',
        priceSnapshot: 20000,
        quantity: 1,
        status: 'ACTIVE',
        note: '',
        toppings: [],
      },
    ],
  };
}
let state = fixture();
beforeEach(() => {
  pinLimiter.clear();
  vi.resetAllMocks();
  state = fixture();
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
  mocks.db.user.findFirst.mockResolvedValue(actor);
  mocks.db.user.findMany.mockResolvedValue([{ id: 'owner', pinHash: 'hash' }]);
  mocks.compare.mockImplementation(async (pin) => pin === '1111');
  mocks.db.shift.findFirst.mockResolvedValue({ id: 'shift' });
  mocks.db.table.findFirst.mockResolvedValue({ id: 'table2' });
  mocks.db.order.findFirst.mockImplementation(async ({ where }) =>
    typeof where.id === 'string' ? state : null,
  );
  mocks.db.order.findUnique.mockResolvedValue(null);
  mocks.db.order.findUniqueOrThrow.mockImplementation(async () => state);
  mocks.db.order.aggregate.mockResolvedValue({ _max: { dailyNumber: 1 } });
  mocks.db.order.create.mockImplementation(async ({ data }) => ({
    id: data.id,
  }));
  mocks.db.order.update.mockImplementation(async ({ data }) => {
    state = {
      ...state,
      ...data,
      version: data.version
        ? state.version + data.version.increment
        : state.version,
    };
    return state;
  });
  mocks.db.orderItem.update.mockImplementation(async ({ where, data }) => {
    state.items = state.items.map((i) =>
      i.id === where.id ? { ...i, ...data } : i,
    );
    return state.items.find((i) => i.id === where.id);
  });
  mocks.db.orderItem.updateMany.mockImplementation(async ({ data }) => {
    state.items = state.items.map((i) =>
      i.status === 'ACTIVE' ? { ...i, ...data } : i,
    );
    return { count: 2 };
  });
  mocks.db.orderItem.create.mockResolvedValue({ id: 'new-item' });
});
describe('held order transactions', () => {
  it('replays the exact same edit after a lost response without duplicating additions', async () => {
    const input = {
      version: 1,
      order: checkoutSchema.parse({
        id,
        type: 'TAKEAWAY',
        lines: [{ variantId: id, quantity: 1 }],
      }),
    };
    const saved = {
      ...fixture(),
      version: 2,
      requestHash: createHash('sha256')
        .update('edit:' + actor.id + ':' + JSON.stringify(input))
        .digest('hex'),
    };
    mocks.db.order.findFirst.mockResolvedValueOnce(saved);
    expect(await editOrder(actor, id, input)).toEqual(saved);
    expect(mocks.db.orderItem.create).not.toHaveBeenCalled();
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });
  it('shares owner PIN lockout across void/cancel and IP changes', async () => {
    for (let i = 0; i < 5; i++)
      await expect(
        operateOrder({ ...actor, ip: 'a' }, id, {
          action: 'CANCEL',
          version: 1,
          ownerPin: '9999',
          reason: 'test',
        }),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      operateOrder({ ...actor, ip: 'b' }, id, {
        action: 'VOID',
        version: 1,
        itemId,
        ownerPin: '1111',
        reason: 'test',
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.db.orderItem.updateMany).not.toHaveBeenCalled();
  });
  it('rejects stale versions before writing', async () => {
    expect(() => checkVersion(2, 1)).toThrow('tải lại');
    await expect(
      operateOrder(actor, id, { action: 'MOVE', version: 2, tableId: id }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });
  it('rejects wrong PIN without voiding; records reason and authorizing owner for valid PIN', async () => {
    await expect(
      operateOrder(actor, id, {
        action: 'VOID',
        version: 1,
        itemId,
        ownerPin: '9999',
        reason: 'Pha sai',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.db.orderItem.update).not.toHaveBeenCalled();
    const updated = await operateOrder(actor, id, {
      action: 'VOID',
      version: 1,
      itemId,
      ownerPin: '1111',
      reason: 'Pha sai',
    });
    expect(updated.total).toBe(20000);
    expect(updated.version).toBe(2);
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'VOID',
        userId: 'cashier',
        data: expect.objectContaining({
          ownerId: 'owner',
          reason: 'Pha sai',
          itemId,
        }),
      }),
    });
    expect(JSON.stringify(mocks.db.auditLog.create.mock.calls)).not.toContain(
      '1111',
    );
  });
  it('cancels without deleting snapshots and recomputes zero', async () => {
    const result = await operateOrder(actor, id, {
      action: 'CANCEL',
      version: 1,
      ownerPin: '1111',
      reason: 'Khách về',
    });
    expect(result.status).toBe('CANCELLED');
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.status === 'VOIDED')).toBe(true);
  });
  it('moves tables only when the destination is free', async () => {
    await operateOrder(actor, id, { action: 'MOVE', version: 1, tableId: id });
    expect(state.tableId).toBe(id);
    expect(state.version).toBe(2);
    mocks.db.order.findFirst.mockResolvedValue(state);
    await expect(
      operateOrder(actor, id, {
        action: 'MOVE',
        version: 2,
        tableId: otherItemId,
      }),
    ).rejects.toThrow('Bàn đích đang phục vụ');
  });
  it('rejects emptying the source by split, duplicate items and over-quantity', async () => {
    for (const items of [
      [{ itemId, quantity: 3 }],
      [
        { itemId, quantity: 1 },
        { itemId, quantity: 1 },
      ],
      [
        { itemId, quantity: 2 },
        { itemId: otherItemId, quantity: 1 },
      ],
    ]) {
      await expect(
        operateOrder(actor, id, {
          action: 'SPLIT',
          version: 1,
          newId: otherItemId,
          items,
        }),
      ).rejects.toThrow();
    }
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });
  it('splits partial quantity retaining topping and note snapshots', async () => {
    await operateOrder(actor, id, {
      action: 'SPLIT',
      version: 1,
      newId: otherItemId,
      items: [{ itemId, quantity: 1 }],
    });
    expect(mocks.db.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: otherItemId,
        quantity: 1,
        priceSnapshot: 30000,
        nameSnapshot: 'Latte · M',
        note: 'ít đá',
      }),
    });
    expect(mocks.db.orderItemTopping.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ nameSnapshot: 'Kem', priceSnapshot: 5000 }),
      ],
    });
  });
  it('merges both versions and rejects self or changed source', async () => {
    await expect(
      operateOrder(actor, id, {
        action: 'MERGE',
        version: 1,
        sourceId: id,
        sourceVersion: 1,
      }),
    ).rejects.toThrow('chính nó');
    mocks.db.order.findFirst
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ ...state, id: otherItemId, version: 2 });
    await expect(
      operateOrder(actor, id, {
        action: 'MERGE',
        version: 1,
        sourceId: otherItemId,
        sourceVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.db.orderItem.updateMany).not.toHaveBeenCalled();
  });
  it('rejects removed or reduced saved lines without PIN and prevents snapshot repricing', async () => {
    const base = checkoutSchema.parse({
      id,
      type: 'TAKEAWAY',
      lines: [
        { itemId, variantId: id, quantity: 2, toppingIds: [id] },
        { itemId: otherItemId, variantId: id, quantity: 1 },
      ],
    });
    await expect(
      editOrder(actor, id, {
        version: 1,
        order: { ...base, lines: base.lines.slice(0, 1) },
      }),
    ).rejects.toThrow('PIN');
    await expect(
      editOrder(actor, id, {
        version: 1,
        order: {
          ...base,
          lines: base.lines.map((l, i) =>
            i === 0 ? { ...l, quantity: 1 } : l,
          ),
        },
      }),
    ).rejects.toThrow('PIN');
    const updated = await editOrder(actor, id, { version: 1, order: base });
    expect(updated.total).toBe(90000);
    expect(updated.version).toBe(2);
    expect(mocks.db.productVariant.findFirst).not.toHaveBeenCalled();
  });
  it('rejects closed shifts, paid orders, missing orders and inactive actors', async () => {
    mocks.db.user.findFirst.mockResolvedValueOnce(null);
    await expect(
      operateOrder(actor, id, { action: 'MOVE', version: 1, tableId: id }),
    ).rejects.toMatchObject({ status: 401 });
    mocks.db.order.findFirst.mockResolvedValueOnce(null);
    await expect(
      operateOrder(actor, id, { action: 'MOVE', version: 1, tableId: id }),
    ).rejects.toMatchObject({ status: 404 });
    state.status = 'PAID';
    await expect(
      operateOrder(actor, id, { action: 'MOVE', version: 1, tableId: id }),
    ).rejects.toThrow('đang mở');
    state.status = 'OPEN';
    mocks.db.shift.findFirst.mockResolvedValue(null);
    await expect(
      operateOrder(actor, id, { action: 'MOVE', version: 1, tableId: id }),
    ).rejects.toThrow('Ca đã đóng');
  });
});
