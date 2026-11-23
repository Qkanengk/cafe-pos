import { beforeEach, it, expect, vi } from 'vitest';
import { serverConnection } from '../../lib/server-connection';
beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn());
});
it('checks server reachability even when there are no queued orders', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ ok: true }))
    .mockRejectedValueOnce(new TypeError('refused'));
  expect((await serverConnection()).online).toBe(true);
  expect(await serverConnection()).toMatchObject({
    online: false,
    error: expect.stringContaining('không phản hồi'),
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('reports HTTP failures and expired sessions rather than saying online', async () => {
  for (const status of [503, 401]) {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status }));
    expect((await serverConnection()).online).toBe(false);
  }
});
it('does not send a heartbeat when the browser is offline', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  expect((await serverConnection()).online).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
