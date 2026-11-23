import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../lib/offline', () => ({ prepareLocal: vi.fn() }));
import { prepareLocal } from '../../lib/offline';
import { checkoutWithFallback } from '../../lib/checkout-client';
import { checkoutSchema } from '../../lib/sales-validation';
import type { SaleOrder } from '../../lib/sales-types';
const input = checkoutSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  type: 'TAKEAWAY',
  lines: [{ variantId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});
it('falls back with the same UUID when Wi-Fi is up but transport or server fails', async () => {
  vi.mocked(prepareLocal).mockResolvedValue({
    id: input.id,
    code: 'TAM-local',
  } as SaleOrder);
  vi.mocked(fetch)
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response('down', { status: 503 }));
  for (let i = 0; i < 2; i++)
    expect(await checkoutWithFallback(input, null)).toMatchObject({
      id: input.id,
      code: 'TAM-local',
    });
  expect(prepareLocal).toHaveBeenCalledWith(input);
});
it('does not hide validation, auth, or version errors behind a local sale', async () => {
  for (const status of [400, 401, 403, 409]) {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: 'rejected' }, { status }),
    );
    await expect(checkoutWithFallback(input, null)).rejects.toThrow('rejected');
  }
  expect(prepareLocal).not.toHaveBeenCalled();
});
it('never forks a shared held server order on a server outage', async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
  await expect(
    checkoutWithFallback(input, { id: input.id, version: 2 } as SaleOrder),
  ).rejects.toThrow('cùng mã đơn');
  expect(prepareLocal).not.toHaveBeenCalled();
});
