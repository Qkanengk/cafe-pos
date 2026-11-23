import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  const response = await context.request.fetch(path, {
    method,
    headers: { Origin: baseURL },
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json();
  assert.equal(response.status(), status, JSON.stringify(body));
  return body;
}
try {
  await api('/api/auth/login', 'POST', {
    mode: 'password',
    email: 'owner@cafe.local',
    password: 'owner123',
  });
  const shift = await api('/api/shifts', 'POST', { openingCash: 500000 }, 201);
  const menu = await api('/api/menu');
  const variant = menu.products.find((p) => p.isAvailable && p.variants.length)
    .variants[0];
  let order = await api(
    '/api/orders',
    'POST',
    {
      id: randomUUID(),
      type: 'TAKEAWAY',
      lines: [{ variantId: variant.id, quantity: 3, toppingIds: [], note: '' }],
      discount: { type: 'AMOUNT', value: 1 },
    },
    201,
  );
  await page.goto('/pos?orderId=' + order.id);
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  await page.getByText('Chia đều', { exact: true }).click();
  await page.getByLabel('Số người chia đều').fill('3');
  await page
    .getByRole('button', { name: 'Xác nhận chia đều', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /Chia đều/ })).toBeVisible();
  order = await api('/api/orders/' + order.id);
  assert.equal(order.paymentParts.length, 3);
  const base = Math.floor(order.total / 3);
  assert.deepEqual(
    order.paymentParts.map((p) => p.amount),
    [base + (order.total % 3), base, base],
  );
  const first = order.paymentParts[0],
    paymentId = randomUUID();
  order = await api(`/api/orders/${order.id}/shares/${first.id}/pay`, 'POST', {
    id: paymentId,
    method: 'CASH',
    received: first.amount,
  });
  assert.equal(order.status, 'OPEN');
  await api(`/api/orders/${order.id}/shares/${first.id}/pay`, 'POST', {
    id: paymentId,
    method: 'CASH',
    received: first.amount,
  });
  await api(
    `/api/orders/${order.id}/shares/${first.id}/pay`,
    'POST',
    { id: randomUUID(), method: 'CASH', received: first.amount },
    409,
  );
  await api(
    '/api/orders/' + order.id + '/pay',
    'POST',
    {
      id: randomUUID(),
      version: order.version,
      method: 'CASH',
      received: order.total,
    },
    409,
  );
  await page.reload();
  for (const p of order.paymentParts.slice(1)) {
    await page
      .getByRole('button', {
        name: 'Thanh toán phần ' + p.position,
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Chuyển khoản QR' }).click();
    await dialog.getByLabel('Đã nhận chuyển khoản').check();
    await dialog
      .getByRole('button', { name: 'Xác nhận đã nhận tiền', exact: true })
      .click();
  }
  await expect(
    page.getByText('Thanh toán thành công', { exact: true }),
  ).toBeVisible();
  order = await api('/api/orders/' + order.id);
  assert.equal(order.status, 'PAID');
  assert.equal(order.payments.length, 3);
  assert.equal(
    order.payments.reduce((s, p) => s + p.amount, 0),
    order.total,
  );
  const summary = (await api('/api/shifts')).find((s) => s.id === shift.id);
  assert.equal(summary.expectedCash, 500000 + first.amount);
  await page.goto('/print/' + order.id);
  await expect(page.getByTestId('receipt')).toBeVisible();
  console.log(
    'PASS equal shares: integer remainder on first, cash + QR, partial OPEN → final PAID, idempotent UUID and second payer conflict, shift totals and receipt',
  );
  await api('/api/shifts', 'PUT', {
    id: shift.id,
    countedCash: summary.expectedCash,
    note: 'Finance regression',
  });
} finally {
  await browser.close();
}
