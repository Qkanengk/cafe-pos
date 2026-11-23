import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  });
  return {
    approve: vi.fn(),
    db: {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
      user: model(),
      shift: model(),
      order: model(),
      payment: model(),
      refund: model(),
      auditLog: model(),
    },
  };
});
vi.mock('../../lib/db', () => ({ db: mocks.db }));
vi.mock('../../lib/owner-approval', () => ({ approveOwner: mocks.approve }));
import { planRefund } from '../../lib/refund-amount';
import { refundOrder, refundSchema } from '../../lib/refunds';
import { paymentTotals, expectedCash } from '../../lib/money';
const item = {
  id: '8172ac2f-3cd4-4559-a782-b2f4c30c08e6',
  productId: 'p',
  variantId: 'v',
  nameSnapshot: 'Cà phê · S',
  priceSnapshot: 10000,
  quantity: 3,
  note: '',
  status: 'ACTIVE' as const,
  toppings: [],
};
const order = {
  id: 'o',
  storeId: 's',
  status: 'PAID',
  version: 1,
  total: 29999,
  items: [item],
  refunds: [],
};
const actor = { id: 'user', storeId: 's' },
  input = {
    id: '6fa9c5b5-4353-4ef9-a266-b8d3a559e8e3',
    version: 1,
    amount: 9999,
    ownerPin: '1111',
    reason: 'Sai món',
    method: 'CASH' as const,
    items: [{ itemId: item.id, quantity: 1 }],
  };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
  mocks.db.user.findFirst.mockResolvedValue(actor);
  mocks.approve.mockResolvedValue('owner');
  mocks.db.order.findFirst.mockResolvedValue(order);
  mocks.db.order.findUniqueOrThrow.mockResolvedValue(order);
  mocks.db.shift.findFirst.mockResolvedValue({ id: 'new-shift' });
});
it('allocates discounted/topping item amounts without losing a dong across repeated refunds', () => {
  const first = planRefund(order, input.items);
  expect(first[0].amount).toBe(9999);
  const remaining = planRefund({ ...order, refunds: [{ items: first }] });
  expect(remaining).toEqual([{ itemId: item.id, quantity: 2, amount: 20000 }]);
  expect(first[0].amount + remaining[0].amount).toBe(order.total);
  expect(
    planRefund({
      ...order,
      total: 44999,
      items: [
        {
          ...item,
          toppings: [
            {
              id: 't',
              toppingId: 't',
              nameSnapshot: 'Sữa',
              priceSnapshot: 5000,
            },
          ],
        },
      ],
    })[0].amount,
  ).toBe(44999);
});
it('rejects empty, unknown, duplicate or excessive refunded quantities', () => {
  for (const selection of [
    [],
    [{ itemId: 'missing', quantity: 1 }],
    [...input.items, ...input.items],
    [{ itemId: item.id, quantity: 4 }],
  ])
    expect(() => planRefund(order, selection)).toThrow();
  expect(() =>
    planRefund({
      ...order,
      refunds: [{ items: [{ itemId: item.id, quantity: 3, amount: 29999 }] }],
    }),
  ).toThrow();
});
it('records authorized negative payments in the current shift and replays the same refund UUID once', async () => {
  await refundOrder(actor, 'o', input);
  expect(mocks.approve).toHaveBeenCalledWith(mocks.db, actor, '1111');
  expect(mocks.db.payment.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      refundId: input.id,
      shiftId: 'new-shift',
      amount: -9999,
      method: 'CASH',
    }),
  });
  const created = mocks.db.refund.create.mock.calls[0][0].data;
  expect(JSON.stringify(created)).not.toContain('1111');
  expect(mocks.db.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      action: 'REFUND',
      data: expect.objectContaining({
        ownerId: 'owner',
        reason: 'Sai món',
        amount: 9999,
      }),
    }),
  });
  mocks.db.refund.findFirst.mockResolvedValue({ ...created, orderId: 'o' });
  mocks.db.order.findFirst.mockResolvedValue({ ...order, version: 2 });
  await refundOrder(actor, 'o', input);
  expect(mocks.db.payment.create).toHaveBeenCalledTimes(1);
  await expect(
    refundOrder(actor, 'o', { ...input, reason: 'Changed' }),
  ).rejects.toMatchObject({ status: 409 });
});
it('requires owner approval, a paid bill and a current open shift', async () => {
  mocks.approve.mockRejectedValueOnce(new Error('PIN chủ quán không đúng'));
  await expect(refundOrder(actor, 'o', input)).rejects.toThrow('PIN');
  mocks.db.order.findFirst.mockResolvedValueOnce({ ...order, status: 'OPEN' });
  await expect(refundOrder(actor, 'o', input)).rejects.toMatchObject({
    status: 409,
  });
  mocks.db.shift.findFirst.mockResolvedValue(null);
  await expect(refundOrder(actor, 'o', input)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.db.payment.create).not.toHaveBeenCalled();
  expect(refundSchema.safeParse({ ...input, reason: '' }).success).toBe(false);
});
it('rejects stale full refunds and different confirmed amounts without silently shrinking the payout', async () => {
  const current = {
    ...order,
    version: 2,
    refunds: [
      { items: [{ itemId: item.id, quantity: 1, amount: 9999 }], amount: 9999 },
    ],
  };
  mocks.db.order.findFirst.mockResolvedValue(current);
  const full = { ...input, items: undefined, amount: 29999 };
  await expect(refundOrder(actor, 'o', full)).rejects.toMatchObject({
    status: 409,
    details: { order: current },
  });
  await expect(
    refundOrder(actor, 'o', { ...full, version: 2 }),
  ).rejects.toMatchObject({ status: 409 });
  expect(mocks.db.payment.create).not.toHaveBeenCalled();
  expect(mocks.db.refund.create).not.toHaveBeenCalled();
  await refundOrder(actor, 'o', { ...full, version: 2, amount: 20000 });
  expect(mocks.db.payment.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ amount: -20000 }),
  });
});
it('subtracts refunds by method from current-shift expected cash, including refund-only shifts', () => {
  expect(
    paymentTotals([
      { method: 'CASH', amount: -10000 },
      { method: 'BANK_TRANSFER', amount: -25000 },
    ]),
  ).toEqual({ cash: -10000, bank: -25000 });
  expect(expectedCash(500000, [{ method: 'CASH', amount: -10000 }])).toBe(
    490000,
  );
});
