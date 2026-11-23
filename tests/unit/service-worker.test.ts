import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8',
);
async function navigate(response: Response | Error) {
  let handler: (event: unknown) => void = () => {};
  const fetcher = vi.fn().mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const match = vi
    .fn()
    .mockResolvedValue(new Response('cached local workspace'));
  runInNewContext(source, {
    self: {
      location: { origin: 'http://localhost:3000' },
      addEventListener: (name: string, fn: typeof handler) => {
        if (name === 'fetch') handler = fn;
      },
    },
    fetch: fetcher,
    caches: {
      keys: async () => ['cafe-pos-v5-user'],
      open: async () => ({ match }),
    },
    URL,
    Response,
  });
  let result: Promise<Response> | undefined;
  handler({
    request: {
      url: 'http://localhost:3000/pos?orderId=local-uuid',
      method: 'GET',
      mode: 'navigate',
    },
    respondWith: (r: Promise<Response>) => {
      result = r;
    },
  });
  return (await result!).text();
}
describe('local-held-order navigation', () => {
  it('uses the IndexedDB-capable workspace on a server 404', async () => {
    expect(await navigate(new Response('not found', { status: 404 }))).toBe(
      'cached local workspace',
    );
  });
  it('uses the workspace for lost network and server outage', async () => {
    for (const error of [
      new Error('offline'),
      new Response('down', { status: 503 }),
    ])
      expect(await navigate(error)).toBe('cached local workspace');
  });
  it('keeps successful responses and authentication errors', async () => {
    expect(await navigate(new Response('online POS'))).toBe('online POS');
    expect(await navigate(new Response('login', { status: 401 }))).toBe(
      'login',
    );
  });
});
