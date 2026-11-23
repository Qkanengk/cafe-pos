import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
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
  const shots = process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots/retest';
  await mkdir(shots, { recursive: true });
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
    if (collect)
      await page.screenshot({ path: shots + '/cancel-unpaid-shares.png' });
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
  const shift = await api('/api/shifts', 'POST', { openingCash: 100000 }, 201);
  let order = await api('/api/orders', 'POST', {
    id: randomUUID(),
    type: 'TAKEAWAY',
    lines: [{ variantId: variant.id, quantity: 2, toppingIds: [] }],
  });
  order = await api('/api/orders/' + order.id + '/pay', 'POST', {
    id: randomUUID(),
    method: 'CASH',
    received: order.total,
    version: order.version,
  });
  await page.goto('/orders?shiftId=' + shift.id);
  await page
    .getByRole('row')
    .filter({ hasText: order.code })
    .getByRole('button', { name: /Chi tiết đơn/ })
    .click();
  await page.getByText('Hoàn tiền có PIN chủ quán', { exact: true }).click();
  await page
    .getByLabel('Phương thức hoàn', { exact: true })
    .selectOption('BANK_TRANSFER');
  await page
    .getByLabel('Lý do hoàn', { exact: true })
    .fill('Hoàn toàn bộ sau đối chiếu');
  await page.getByLabel('PIN chủ quán', { exact: true }).fill('1111');
  const partial = {
    id: randomUUID(),
    version: order.version,
    amount: variant.price,
    method: 'BANK_TRANSFER',
    ownerPin: '1111',
    reason: 'Hoàn một món ở máy khác',
    items: [{ itemId: order.items[0].id, quantity: 1 }],
  };
  let current = await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    partial,
  );
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith('/refunds') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /^Xác nhận đã hoàn / }).click();
  assert.equal((await rejected).status(), 409);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Hóa đơn đã thay đổi' }),
  ).toBeVisible();
  await expect(page.getByLabel('PIN chủ quán', { exact: true })).toHaveValue(
    '',
  );
  await page.screenshot({ path: shots + '/stale-refund-conflict.png' });
  assert.equal((await api('/api/orders/' + order.id)).refunds.length, 1);
  await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    {
      ...partial,
      id: randomUUID(),
      version: current.version,
      amount: order.total,
      items: undefined,
    },
    409,
  );
  await api('/api/orders/' + order.id + '/refunds', 'POST', partial);
  await page.getByLabel('PIN chủ quán', { exact: true }).fill('1111');
  await page.getByRole('button', { name: /^Xác nhận đã hoàn / }).click();
  await expect(
    page.getByText('Hoàn tiền có PIN chủ quán', { exact: true }),
  ).toHaveCount(0);
  current = await api('/api/orders/' + order.id);
  assert.equal(current.refunds.length, 2);
  assert.equal(
    current.refunds.reduce((s, r) => s + r.amount, 0),
    order.total,
  );
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  const methods = page
    .getByRole('row')
    .filter({ hasText: order.code })
    .locator('td')
    .nth(5);
  await expect(methods).toContainText('Tiền mặt');
  await expect(methods).not.toContainText('Chuyển khoản');
  await expect(methods.getByText(/^Đã hoàn /)).toBeVisible();
  await api('/api/shifts', 'PUT', {
    id: shift.id,
    countedCash: 100000 + order.total,
    note: 'Stale refund regression',
  });
  console.log(
    'PASS stale refunds: concurrent partial refund rejects the old full amount/version with 409 and no payout; PIN cleared; fresh explicit confirmation succeeds; replay stays idempotent',
  );
} finally {
  await browser.close();
}
