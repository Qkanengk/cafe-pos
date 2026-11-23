/* global self, caches, fetch, URL, Response */
const PREFIX = 'cafe-pos-v5-';
let activeCache = null;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
async function cachePage(cache, path) {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'text/html' },
  });
  if (!response.ok || response.redirected) throw new Error('Session required');
  await cache.put(path, response.clone());
  const html = await response.text();
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((m) => m[1].replaceAll('&amp;', '&'))
        .filter((p) => p.startsWith('/_next/static/')),
    ),
  ];
  await Promise.all(
    assets.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Asset unavailable');
      await cache.put(path, response);
    }),
  );
}
self.addEventListener('message', (event) => {
  if (event.data?.type === 'LOGOUT') {
    activeCache = null;
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith(PREFIX))
              .map((k) => caches.delete(k)),
          ),
        ),
    );
    return;
  }
  if (event.data?.type === 'CACHE_SESSION')
    event.waitUntil(
      (async () => {
        try {
          const name = PREFIX + event.data.key;
          const cache = await caches.open(name);
          await cachePage(cache, '/offline');
          await cachePage(cache, '/pos');
          await cachePage(cache, '/tables');
          const menu = await fetch('/api/menu', { cache: 'no-store' });
          if (!menu.ok) throw new Error('Menu unavailable');
          await cache.put('/api/menu', menu);
          await Promise.all(
            [
              '/manifest.webmanifest',
              '/icons/icon-192.png',
              '/icons/icon-512.png',
            ].map(async (path) => {
              const response = await fetch(path);
              if (!response.ok) throw new Error('Icon unavailable');
              await cache.put(path, response);
            }),
          );
          activeCache = name;
          await Promise.all(
            (await caches.keys())
              .filter((k) => k.startsWith(PREFIX) && k !== name)
              .map((k) => caches.delete(k)),
          );
          event.ports[0]?.postMessage({ ok: true });
        } catch {
          event.ports[0]?.postMessage({ ok: false });
        }
      })(),
    );
});
async function currentCache() {
  if (activeCache) return caches.open(activeCache);
  const names = (await caches.keys()).filter((k) => k.startsWith(PREFIX));
  if (names.length === 1) {
    activeCache = names[0];
    return caches.open(activeCache);
  }
  return null;
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET')
    return;
  if (
    event.request.mode === 'navigate' &&
    ['/pos', '/tables', '/offline'].includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.status === 404 || response.status >= 500)
            throw new Error('Workspace unavailable');
          return response;
        } catch {
          const cache = await currentCache();
          const fallback = await cache?.match('/offline');
          return (
            fallback ||
            new Response(
              'Cần đăng nhập và mở POS trực tuyến trước khi bán ngoại tuyến.',
              {
                status: 503,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              },
            )
          );
        }
      })(),
    );
    return;
  }
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/api/menu' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok && url.pathname.startsWith('/_next/static/')) {
            const cache = await currentCache();
            await cache?.put(event.request, response.clone());
          }
          return response;
        } catch {
          const cache = await currentCache();
          return (
            (await cache?.match(
              url.pathname === '/api/menu' ? '/api/menu' : event.request,
            )) || Response.error()
          );
        }
      })(),
    );
  }
});
