import { afterEach, it, expect, vi } from 'vitest';
import { posFetch, RequestTimeoutError } from '../../lib/pos-fetch';
afterEach(() => vi.useRealTimers());
it('aborts a hanging request after twelve seconds with Vietnamese safe-retry guidance', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }),
  );
  const request = posFetch('/api/orders', {
    method: 'POST',
    body: 'same-uuid',
  });
  const assertion = expect(request).rejects.toThrow('cùng mã đơn/thanh toán');
  await vi.advanceTimersByTimeAsync(12000);
  await assertion;
  expect(signal?.aborted).toBe(true);
});
it('also times out a hanging response body', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ text: () => new Promise(() => {}) }),
  );
  const request = posFetch('/api/orders');
  const assertion = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
  await vi.advanceTimersByTimeAsync(12000);
  await assertion;
});
it('retains status/body and clears the timer on success or network error', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ error: 'no' }, { status: 409 })),
  );
  const response = await posFetch('/api/orders');
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'no' });
  expect(vi.getTimerCount()).toBe(0);
  vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
  await expect(posFetch('/api/shifts')).rejects.toThrow('offline');
  expect(vi.getTimerCount()).toBe(0);
});
