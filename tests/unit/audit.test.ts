import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/db', () => ({
  db: { auditLog: { findMany: mocks.findMany } },
}));
import { loadAudit, safeAuditData } from '../../lib/audit';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([]);
});
it('never discloses nested PIN/password material', () => {
  expect(
    safeAuditData({
      ownerPin: '1111',
      pinHash: 'hash',
      PASSWORD: 'x',
      prices: { M: 25000 },
      details: [{ new_pin: '2222', reason: 'Sai món' }],
      catalogToken: 'secret',
    }),
  ).toEqual({ prices: { M: 25000 }, details: [{ reason: 'Sai món' }] });
});
it('guards OWNER before reading and rejects bad date filters', async () => {
  await expect(
    loadAudit({ storeId: 's', role: 'CASHIER' }, {}),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    loadAudit({ storeId: 's', role: 'OWNER' }, { from: '2026-02-30' }),
  ).rejects.toThrow();
  expect(mocks.findMany).not.toHaveBeenCalled();
});
it('scopes empty, filtered and paginated reads to the actor’s store', async () => {
  const result = await loadAudit(
    { storeId: 's', role: 'OWNER' },
    { from: '2026-11-23', action: 'DISCOUNT', page: '2' },
  );
  expect(result.entries).toEqual([]);
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ storeId: 's', action: 'DISCOUNT' }),
      skip: 100,
      take: 101,
    }),
  );
});
it('sanitizes stored details before returning a nonempty page', async () => {
  mocks.findMany.mockImplementation(async (args) =>
    args.distinct
      ? [{ action: 'UPDATE' }]
      : [
          {
            id: 'event',
            user: { name: 'Owner' },
            data: { ownerPin: '1111', name: 'New name' },
          },
        ],
  );
  const result = await loadAudit({ storeId: 's', role: 'OWNER' }, {});
  expect(result.entries[0].data).toEqual({ name: 'New name' });
  expect(result.actions).toEqual(['UPDATE']);
});
