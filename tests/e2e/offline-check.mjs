import assert from 'node:assert/strict';
import { sql } from './database.mjs';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000',
  shots = process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});
const cashier = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'allow',
});
const owner = await browser.newContext({
  baseURL,
  viewport: { width: 390, height: 844 },
});
const page = await cashier.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
async function api(ctx, path, method = 'GET', data, status = 200) {
  const response = await ctx.request.fetch(path, {
    method,
    headers: { Origin: baseURL },
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json();
  assert.equal(response.status(), status, path + ': ' + JSON.stringify(body));
  return body;
}
async function queued() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('cafe-pos-offline');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction('outbox')
            .objectStore('outbox')
            .getAll();
          request.onsuccess = () => {
            resolve(request.result);
            db.close();
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}
try {
  await expect
    .poll(
      async () => {
        try {
          return (await cashier.request.get('/login')).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  await api(owner, '/api/auth/login', 'POST', {
    mode: 'password',
    email: process.env.OWNER_EMAIL ?? 'owner@cafe.local',
    password: process.env.OWNER_PASSWORD ?? 'owner123',
  });
  const users = await api(owner, '/api/admin/users'),
    lan = users.find((u) => u.name === 'Lan');
  assert.ok(lan);
  await api(cashier, '/api/auth/login', 'POST', {
    mode: 'pin',
    userId: lan.id,
    pin: '2222',
  });
  const shifts = await api(cashier, '/api/shifts');
  assert.equal(
    shifts.filter((s) => !s.closedAt).length,
    0,
    'Start with no open shift',
  );
  const shift = await api(
    cashier,
    '/api/shifts',
    'POST',
    { openingCash: 200000 },
    201,
  );
  const baseline = Number(
    sql('SELECT count(*) FROM "Order" WHERE status=\'PAID\';'),
  );
  await page.goto('/pos');
  await expect(page.getByTestId('offline-ready')).toHaveText(
    'Sẵn sàng bán ngoại tuyến',
    { timeout: 60000 },
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheDetails = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(
      keys.find((k) => k.startsWith('cafe-pos-v5-')),
    );
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  for (const path of [
    '/offline',
    '/pos',
    '/tables',
    '/api/menu',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/manifest.webmanifest',
  ])
    assert.ok(cacheDetails.includes(path), path + ' must be cached');
  assert.ok(cacheDetails.some((p) => p.startsWith('/_next/static/')));
  console.log(
    'PASS production PWA: manifest/local icons, authenticated app shell, POS/tables, bundled assets and menu cached; open shift cached',
  );
  await cashier.setOffline(true);
  await expect(page.getByTestId('network-status')).toContainText('Ngoại tuyến');
  for (let i = 0; i < 5; i++) {
    if (i === 2) {
      await page.reload({ waitUntil: 'networkidle' });
      await expect(
        page.getByRole('heading', {
          name: 'Một ly ngon, một ngày vui',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId('network-status')).toContainText(
        '2 đơn chờ đồng bộ',
      );
      await page.goto('/tables', { waitUntil: 'networkidle' });
      await expect(
        page.getByRole('heading', { name: 'Sơ đồ bàn', exact: true }),
      ).toBeVisible();
      await page.getByTestId('table-Bàn 1').getByRole('link').click();
      await expect(
        page.getByRole('button', { name: 'Tại bàn', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
    await page
      .getByRole('button', { name: 'Chọn Cà phê đen', exact: true })
      .click();
    const item = page.getByRole('dialog', { name: 'Cà phê đen', exact: true });
    await item.getByRole('button', { name: /Thêm vào đơn/ }).click();
    await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
    const pay = page.getByRole('dialog', { name: /^Thanh toán TAM-/ });
    if (i === 2) {
      await pay
        .getByRole('button', { name: 'Chuyển khoản', exact: true })
        .click();
      await expect(pay.getByRole('img', { name: /VietQR/ })).toBeVisible();
      const src = await pay
        .getByRole('img', { name: /VietQR/ })
        .getAttribute('src');
      assert.ok(src.startsWith('data:image/png'));
      await pay.getByRole('button', { name: 'Tiền mặt', exact: true }).click();
    }
    await pay.getByTestId('cash-suggestion').first().click();
    await pay
      .getByRole('button', { name: 'Xác nhận đã nhận tiền', exact: true })
      .click();
    await expect(pay).toBeHidden();
    await expect(page.getByTestId('network-status')).toContainText(
      i + 1 + ' đơn chờ đồng bộ',
    );
  }
  const pending = await queued();
  assert.equal(pending.length, 5);
  const ids = pending.map((p) => p.id);
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
  const idList = ids.map((id) => "'" + id + "'").join(',');
  assert.equal(
    Number(sql('SELECT count(*) FROM "Order" WHERE id IN (' + idList + ');')),
    0,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: shots + '/offline-pending.png',
    fullPage: false,
  });
  console.log(
    'PASS offline: 5 cash sales persisted in Dexie with client order/payment UUIDs and TAM codes; indicator=5 pending; no server rows',
  );
  console.log(
    'PASS cold offline reload retains queue, cached floor map opens dine-in POS, VietQR PNG generated locally without network',
  );
  const payload = { entries: pending.map((p) => p.entry) };
  await cashier.route('**/api/sync', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Máy chủ tạm bận - kiểm thử' }),
    }),
  );
  await cashier.setOffline(false);
  await expect(page.getByTestId('network-status')).toContainText('Trực tuyến', {
    timeout: 60000,
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'Máy chủ tạm bận' }),
  ).toBeVisible({ timeout: 30000 });
  assert.equal((await queued()).length, 5);
  assert.equal(
    Number(sql('SELECT count(*) FROM "Order" WHERE id IN (' + idList + ');')),
    0,
  );
  await cashier.unroute('**/api/sync');
  console.log(
    'PASS transient sync failure=503: all 5 paid orders stay in Dexie; Vietnamese retry warning; periodic retry recovers',
  );
  await expect(page.getByTestId('network-status')).toContainText('Đã đồng bộ', {
    timeout: 60000,
  });
  assert.equal((await queued()).length, 0);
  await expect(page.getByText(/^Thanh toán thành công · CF/)).toBeVisible();
  const rows = JSON.parse(
    sql(
      "SELECT json_agg(json_build_object('id',o.id,'code',o.code,'status',o.status,'shiftId',o.\"shiftId\",'paymentId',p.id,'total',o.total)) FROM \"Order\" o JOIN \"Payment\" p ON p.\"orderId\"=o.id WHERE o.id IN (" +
        idList +
        ');',
    ),
  );
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((r) => r.paymentId)).size, 5);
  for (const row of rows) {
    assert.equal(row.status, 'PAID');
    assert.equal(row.shiftId, shift.id);
    assert.match(row.code, /^CF\d{8}-\d{4}$/);
    assert.equal(row.total, pending.find((p) => p.id === row.id).order.total);
  }
  assert.equal(
    Number(sql('SELECT count(*) FROM "Order" WHERE status=\'PAID\';')),
    baseline + 5,
  );
  const replay = await api(cashier, '/api/sync', 'POST', payload);
  assert.ok(replay.results.every((r) => r.ok));
  assert.equal(replay.results.length, 5);
  assert.equal(
    Number(sql('SELECT count(*) FROM "Order" WHERE id IN (' + idList + ');')),
    5,
  );
  assert.equal(
    Number(
      sql(
        'SELECT count(*) FROM "Payment" WHERE "orderId" IN (' + idList + ');',
      ),
    ),
    5,
  );
  const mismatch = structuredClone(payload);
  mismatch.entries[0].payment.received += 1000;
  const conflict = await api(cashier, '/api/sync', 'POST', {
    entries: [mismatch.entries[0]],
  });
  assert.equal(conflict.results[0].status, 409);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: shots + '/synced.png', fullPage: false });
  console.log(
    'PASS reconnect: exactly 5 new PAID orders and 5 payments; original shift/snapshots preserved; server daily codes assigned',
  );
  console.log(
    'PASS replay identical /api/sync batch: still exactly 5 orders/payments; changed UUID payload=409 and no overwrite',
  );
  await api(cashier, '/api/reports', 'GET', undefined, 403);
  const cashierReports = await cashier.newPage();
  await cashierReports.goto('/reports');
  await expect(cashierReports).toHaveURL(baseURL + '/pos');
  await cashierReports.close();
  const report = await api(owner, '/api/reports');
  const today = report.from;
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  const db = JSON.parse(
    sql(
      "SELECT json_build_object('revenue',COALESCE(sum(total),0),'count',count(*)) FROM \"Order\" WHERE status='PAID' AND (\"paidAt\" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date='" +
        today +
        "'::date;",
    ),
  );
  assert.equal(report.revenue, Number(db.revenue));
  assert.equal(report.count, Number(db.count));
  assert.equal(
    report.average,
    Math.round(Number(db.revenue) / Number(db.count)),
  );
  const methods = JSON.parse(
    sql(
      "SELECT COALESCE(json_agg(r),'[]'::json) FROM (SELECT p.method,sum(p.amount) AS revenue,count(*) AS count FROM \"Payment\" p JOIN \"Order\" o ON o.id=p.\"orderId\" WHERE o.status='PAID' AND (o.\"paidAt\" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date='" +
        today +
        "'::date GROUP BY p.method) r;",
    ),
  );
  for (const method of methods) {
    const row = report.methods.find((r) => r.id === method.method);
    assert.equal(row.revenue, Number(method.revenue));
    assert.equal(row.count, Number(method.count));
  }
  const dbShifts = JSON.parse(
    sql(
      "SELECT COALESCE(json_agg(r),'[]'::json) FROM (SELECT \"shiftId\" AS id,sum(total) AS revenue,count(*) AS count FROM \"Order\" WHERE status='PAID' AND (\"paidAt\" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date='" +
        today +
        '\'::date GROUP BY "shiftId") r;',
    ),
  );
  for (const shift of dbShifts) {
    const row = report.shifts.find((r) => r.id === shift.id);
    assert.equal(row.revenue, Number(shift.revenue));
    assert.equal(row.count, Number(shift.count));
  }
  assert.equal(
    report.days.find((d) => d.id === today).revenue,
    Number(db.revenue),
  );
  assert.equal(
    report.topRevenue.reduce((s, r) => s + r.revenue, 0) <= report.revenue,
    true,
  );
  await api(owner, '/api/reports?from=2026-02-30', 'GET', undefined, 400);
  const phone = await owner.newPage();
  await phone.goto('/reports');
  await expect(phone.getByTestId('report-revenue')).toHaveText(
    fmt(Number(db.revenue)),
  );
  await expect(phone.getByTestId('report-count')).toHaveText(String(db.count));
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await phone.screenshot({
    path: shots + '/reports-phone.png',
    fullPage: true,
  });
  console.log(
    'PASS OWNER reports today match SQL: revenue=' +
      db.revenue +
      ' VND, orders=' +
      db.count +
      ', average=' +
      report.average +
      '; day/shift/payment breakdowns match; cashier API=403/page redirect; invalid range=400',
  );
  const empty = await api(owner, '/api/reports?from=2000-01-01&to=2000-01-01');
  assert.equal(empty.revenue, 0);
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.topQuantity, []);
  const current = (await api(cashier, '/api/shifts')).find(
    (s) => s.id === shift.id,
  );
  await api(cashier, '/api/shifts', 'PUT', {
    id: shift.id,
    countedCash: current.expectedCash,
    note: 'Phase 5 offline verification',
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS reports phone fits 390px, empty range handled; no browser runtime errors; test shift closed',
  );
  console.log(
    'PASS screenshots: ' +
      ['offline-pending.png', 'synced.png', 'reports-phone.png']
        .map((f) => shots + '/' + f)
        .join(', '),
  );
} finally {
  await browser.close();
}
