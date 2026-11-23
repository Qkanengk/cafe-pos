import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ order: vi.fn(), audit: vi.fn() }));
vi.mock('../../lib/db', () => ({
  db: {
    order: { findFirst: mocks.order },
    auditLog: { findFirst: mocks.audit },
  },
}));
import { loadOrderResolution } from '../../lib/order-resolution';
const id = '11111111-1111-4111-8111-111111111111',
  targetId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => vi.resetAllMocks());
it('returns paid results instead of pretending the order does not exist', async () => {
  mocks.order.mockResolvedValue({ id, status: 'PAID' });
  expect((await loadOrderResolution('store', id))?.order.status).toBe('PAID');
  expect(mocks.audit).not.toHaveBeenCalled();
});
it('resolves a merged source to the destination without crossing store boundaries', async () => {
  mocks.order
    .mockResolvedValueOnce({ id, status: 'CANCELLED' })
    .mockResolvedValueOnce({ id: targetId, code: 'CF-target' });
  mocks.audit.mockResolvedValue({ data: { targetId } });
  expect((await loadOrderResolution('store', id))?.target).toEqual({
    id: targetId,
    code: 'CF-target',
  });
  expect(mocks.order).toHaveBeenLastCalledWith({
    where: { id: targetId, storeId: 'store' },
    select: { id: true, code: true },
  });
});
it('handles missing, malformed and genuinely cancelled orders', async () => {
  expect(await loadOrderResolution('store', 'invalid')).toBeNull();
  expect(mocks.order).not.toHaveBeenCalled();
  mocks.order.mockResolvedValueOnce(null);
  expect(await loadOrderResolution('store', id)).toBeNull();
  mocks.order.mockResolvedValueOnce({ id, status: 'CANCELLED' });
  mocks.audit.mockResolvedValue(null);
  expect((await loadOrderResolution('store', id))?.target).toBeNull();
});
