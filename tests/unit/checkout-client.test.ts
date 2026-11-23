import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../lib/offline', () => ({ prepareLocal: vi.fn() }));
import { prepareLocal } from '../../lib/offline';
import { checkoutWithFallback } from '../../lib/checkout-client';
import { checkoutSchema } from '../../lib/sales-validation';
import type { SaleOrder } from '../../lib/sales-types';
import { RequestTimeoutError } from '../../lib/pos-fetch';
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
  for (let i = 0; i < 2; i++) {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    if (i === 1)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('down', { status: 503 }),
      );
    expect(await checkoutWithFallback(input, null)).toMatchObject({
      id: input.id,
      code: 'TAM-local',
    });
  }
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
it('treats checkout timeout as an offline-eligible transport failure', async () => {
  vi.mocked(fetch).mockRejectedValue(new RequestTimeoutError());
  await checkoutWithFallback(input, null);
  expect(prepareLocal).toHaveBeenCalledWith(input);
});
const committed: SaleOrder = {
  id: input.id,
  version: 1,
  subtotal: 25000,
  total: 25000,
  createdAt: new Date().toISOString(),
  paidAt: null,
  createdBy: 'cashier',
  creator: { name: 'Lan' },
  table: null,
  payments: [],
  code: 'CF001',
  status: 'OPEN',
  type: 'TAKEAWAY',
  tableId: null,
  note: '',
  discountType: null,
  discountValue: 0,
  items: [
    {
      id: input.id,
      productId: input.id,
      nameSnapshot: 'Coffee · M',
      priceSnapshot: 25000,
      variantId: input.lines[0].variantId,
      quantity: 1,
      note: '',
      status: 'ACTIVE',
      toppings: [],
    },
  ],
};
it('recovers a matching committed order before creating a local fallback', async () => {
  vi.mocked(fetch)
    .mockRejectedValueOnce(new RequestTimeoutError())
    .mockResolvedValueOnce(Response.json(committed));
  expect(await checkoutWithFallback(input, null)).toEqual(committed);
  expect(prepareLocal).not.toHaveBeenCalled();
});
it('surfaces a reachable server conflict or expired session instead of forking it', async () => {
  vi.mocked(fetch)
    .mockRejectedValueOnce(new RequestTimeoutError())
    .mockResolvedValueOnce(Response.json({ ...committed, items: [] }));
  await expect(checkoutWithFallback(input, null)).rejects.toThrow(
    'nội dung khác',
  );
  vi.mocked(fetch)
    .mockRejectedValueOnce(new RequestTimeoutError())
    .mockResolvedValueOnce(Response.json({}, { status: 401 }));
  await expect(checkoutWithFallback(input, null)).rejects.toThrow(
    'đăng nhập lại',
  );
  expect(prepareLocal).not.toHaveBeenCalled();
});
