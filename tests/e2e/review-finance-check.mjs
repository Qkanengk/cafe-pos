import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
    baseURL,
    viewport: { width: 820, height: 1180 },
  }),
  page = await context.newPage();
async function api(path, method = 'GET', data, status = 200) {
  const r = await context.request.fetch(path, {
    method,
    headers: { Origin: baseURL },
    ...(data === undefined ? {} : { data }),
  });
  const body = await r.json();
  assert.equal(r.status(), status, JSON.stringify(body));
  return body;
}
try {
  await api('/api/auth/login', 'POST', {
    mode: 'password',
    email: 'owner@cafe.local',
    password: 'owner123',
  });
  const menu = await api('/api/menu'),
    variant = menu.products.find((p) => p.isAvailable && p.variants.length)
      .variants[0];
  for (const collect of [false, true]) {
    const shift = await api(
      '/api/shifts',
      'POST',
      { openingCash: 100000 },
      201,
    );
    let order = await api('/api/orders', 'POST', {
      id: randomUUID(),
      type: 'TAKEAWAY',
      lines: [{ variantId: variant.id, quantity: 3, toppingIds: [] }],
    });
    order = await api('/api/orders/' + order.id + '/shares', 'POST', {
      id: randomUUID(),
      version: order.version,
      count: 3,
    });
    const unpaid = order.paymentParts[1].id;
    if (collect)
      order = await api(
        '/api/orders/' +
          order.id +
          '/shares/' +
          order.paymentParts[0].id +
          '/pay',
        'POST',
        {
          id: randomUUID(),
          method: 'CASH',
          received: variant.price,
          version: order.version,
        },
      );
    await page.goto('/pos?orderId=' + order.id);
    const label = collect ? 'Hủy phần chưa thu' : 'Hủy đơn';
    await page.getByRole('button', { name: label, exact: true }).click();
    if (collect)
      await expect(page.getByText(/Không hoàn tiền\./)).toBeVisible();
    await page
      .getByLabel('Lý do', { exact: true })
      .fill('Khách về, miễn phần chưa thu');
    await page.getByLabel('PIN chủ quán', { exact: true }).fill('1111');
    await page
      .getByRole('button', {
        name: 'Xác nhận ' + label.toLocaleLowerCase('vi'),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: collect ? 'Thanh toán thành công' : /Đã hủy đơn/,
      }),
    ).toBeVisible();
    order = await api('/api/orders/' + order.id);
    assert.equal(order.status, collect ? 'PAID' : 'CANCELLED');
    assert.equal(order.total, collect ? variant.price : 0);
    if (collect) {
      assert.equal(order.paymentParts.length, 1);
      assert.equal(order.payments.length, 1);
      await api(
        '/api/orders/' + order.id + '/shares/' + unpaid + '/pay',
        'POST',
        { id: randomUUID(), method: 'CASH', received: variant.price },
        404,
      );
    }
    await api('/api/shifts', 'PUT', {
      id: shift.id,
      countedCash: 100000 + (collect ? variant.price : 0),
      note: 'Shared cancellation regression',
    });
  }
  console.log(
    'PASS share cancellation: owner can cancel an unpaid plan or waive unpaid remainder while preserving collected funds; both shifts close',
  );
} finally {
  await browser.close();
}
