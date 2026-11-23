import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  });
  return {
    db: {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
      user: model(),
      shift: model(),
      order: model(),
      payment: model(),
      paymentPart: model(),
      auditLog: model(),
    },
  };
});
vi.mock('../../lib/db', () => ({ db: mocks.db }));
import { equalShares, payShare, startShares } from '../../lib/payment-parts';
const actor = { id: 'user', storeId: 's' };
const payment = {
  id: 'f717a82b-7aa5-4580-8dc9-4de88649f147',
  method: 'CASH' as const,
  received: 5000,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation((fn) => fn(mocks.db));
  mocks.db.user.findFirst.mockResolvedValue(actor);
  mocks.db.shift.findFirst.mockResolvedValue({ id: 'shift' });
});
it('stores one payment per part and only finalizes after the last share', async () => {
  const order = {
    id: 'o',
    storeId: 's',
    shiftId: 'shift',
    status: 'OPEN',
    version: 2,
    businessDate: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
    discountValue: 0,
    paymentParts: [
      { id: 'p1', amount: 3335, payment: null },
      { id: 'p2', amount: 3333, payment: null },
    ],
  };
  mocks.db.order.findFirst.mockResolvedValue(order);
  mocks.db.order.findUniqueOrThrow.mockResolvedValue(order);
  await payShare(actor, 'o', 'p1', payment);
  expect(mocks.db.payment.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      partId: 'p1',
      amount: 3335,
      change: 1665,
      shiftId: 'shift',
    }),
  });
  expect(mocks.db.order.update).toHaveBeenCalledWith({
    where: { id: 'o' },
    data: { version: { increment: 1 } },
  });
  mocks.db.order.findFirst.mockResolvedValue({
    ...order,
    paymentParts: [
      {
        ...order.paymentParts[0],
        payment: { ...payment, confirmedBy: 'user', received: 5000 },
      },
      order.paymentParts[1],
    ],
  });
  await payShare(actor, 'o', 'p2', {
    id: 'b6c87692-b6d1-43d6-8aa4-8eb3db6d3998',
    method: 'BANK_TRANSFER',
    confirmed: true,
  });
  expect(mocks.db.order.update).toHaveBeenLastCalledWith({
    where: { id: 'o' },
    data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }),
  });
  await payShare(actor, 'o', 'p1', payment);
  expect(mocks.db.payment.create).toHaveBeenCalledTimes(2);
  await expect(
    payShare(actor, 'o', 'p1', { ...payment, id: 'different' }),
  ).rejects.toMatchObject({ status: 409 });
});
it('rejects short tender, missing parts, stale split and inactive users', async () => {
  mocks.db.order.findFirst.mockResolvedValue({
    id: 'o',
    status: 'OPEN',
    version: 4,
    paymentParts: [{ id: 'p', amount: 6000, payment: null }],
    payments: [],
  });
  await expect(payShare(actor, 'o', 'p', payment)).rejects.toThrow();
  await expect(payShare(actor, 'o', 'missing', payment)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    startShares(actor, 'o', { id: payment.id, version: 1, count: 2 }),
  ).rejects.toMatchObject({ status: 409 });
  mocks.db.user.findFirst.mockResolvedValue(null);
  await expect(payShare(actor, 'o', 'p', payment)).rejects.toMatchObject({
    status: 401,
  });
  expect(mocks.db.payment.create).not.toHaveBeenCalled();
});
it('divides integer VND exactly, placing the remainder on the first part', () => {
  expect(equalShares(10001, 3)).toEqual([3335, 3333, 3333]);
  expect(equalShares(60000, 2)).toEqual([30000, 30000]);
  for (let n = 2; n <= 20; n++)
    expect(equalShares(100003, n).reduce((a, b) => a + b, 0)).toBe(100003);
});
it('rejects empty, fractional, excessive or zero-value shares', () => {
  for (const [total, count] of [
    [0, 2],
    [5, 6],
    [100, 0],
    [100, 21],
    [100, 2.5],
  ])
    expect(() => equalShares(total, count)).toThrow();
});
