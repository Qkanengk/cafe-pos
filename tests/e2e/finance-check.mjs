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
  const before = await api('/api/reports');
  const shift = await api('/api/shifts', 'POST', { openingCash: 500000 }, 201);
  const menu = await api('/api/menu');
  const category = menu.products.find(
    (p) => p.isAvailable && p.variants.length,
  ).categoryId;
  const blocked = await api(
    '/api/admin/categories',
    'DELETE',
    { id: category },
    409,
  );
  assert.ok(blocked.error.includes('Hiển thị danh mục trên quầy'));
  const variant = menu.products.find((p) => p.isAvailable && p.variants.length)
    .variants[0];
  let order = await api(
    '/api/orders',
    'POST',
    {
      id: randomUUID(),
      type: 'TAKEAWAY',
      lines: Array.from({ length: 6 }, (_, i) => ({
        variantId: variant.id,
        quantity: 1,
        toppingIds: [],
        note: 'Món ' + i,
      })),
      discount: { type: 'AMOUNT', value: 1 },
    },
    200,
  );
  await page.goto('/pos?orderId=' + order.id);
  const payButton = page.getByRole('button', {
    name: 'Thanh toán',
    exact: true,
  });
  const rect = await payButton.boundingBox();
  assert.ok(
    rect && rect.y >= 0 && rect.y + rect.height <= 1180,
    'Portrait pay button must be visible without scrolling',
  );
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  await page.getByText('Chia đều', { exact: true }).click();
  await page.getByLabel('Số người chia đều').fill('3');
  await page
    .getByRole('button', { name: 'Xác nhận chia đều', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /Chia đều/ })).toBeVisible();
  await mkdir(process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots', {
    recursive: true,
  });
  await page.screenshot({
    path:
      (process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots') +
      '/equal-shares.png',
  });
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
    await dialog
      .getByRole('button', { name: 'Chuyển khoản', exact: true })
      .click();
    await dialog.getByRole('checkbox').check();
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
  await page.goto('/print/receipt?orderId=' + order.id);
  await expect(page.getByTestId('receipt')).toBeVisible();
  console.log(
    'PASS equal shares: integer remainder on first, cash + QR, partial OPEN → final PAID, idempotent UUID and second payer conflict, shift totals and receipt',
  );
  await api('/api/shifts', 'PUT', {
    id: shift.id,
    countedCash: summary.expectedCash,
    note: 'Finance regression',
  });
  const refundShift = await api(
    '/api/shifts',
    'POST',
    { openingCash: 500000 },
    201,
  );
  const refundId = randomUUID(),
    refund = {
      id: refundId,
      version: order.version,
      amount: variant.price,
      ownerPin: '1111',
      reason: 'Hoàn món thử nghiệm',
      method: 'CASH',
      items: [{ itemId: order.items[0].id, quantity: 1 }],
    };
  await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    { ...refund, ownerPin: '0000' },
    403,
  );
  await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    { ...refund, reason: '' },
    400,
  );
  await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    { ...refund, items: [{ itemId: order.items[0].id, quantity: 99 }] },
    409,
  );
  let updated = await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    refund,
  );
  const partial = updated.refunds[0].amount;
  assert.ok(partial > 0 && partial <= variant.price);
  await api('/api/orders/' + order.id + '/refunds', 'POST', refund);
  await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    { ...refund, reason: 'changed' },
    409,
  );
  assert.equal((await api('/api/orders/' + order.id)).refunds.length, 1);
  await page.goto('/orders?shiftId=' + shift.id);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Portrait orders page must not overflow',
  );
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
    .fill('Hoàn phần còn lại');
  await page.getByLabel('PIN chủ quán', { exact: true }).fill('1111');
  await page.getByRole('button', { name: /Xác nhận đã hoàn/ }).click();
  await expect(
    page.getByText('Hoàn tiền có PIN chủ quán', { exact: true }),
  ).toHaveCount(0);
  updated = await api('/api/orders/' + order.id);
  assert.equal(updated.status, 'PAID');
  assert.equal(updated.refunds.length, 2);
  assert.equal(
    updated.refunds.reduce((s, r) => s + r.amount, 0),
    order.total,
  );
  assert.equal(
    updated.payments.reduce((s, p) => s + p.amount, 0),
    0,
  );
  await api(
    '/api/orders/' + order.id + '/refunds',
    'POST',
    { ...refund, id: randomUUID(), items: undefined },
    409,
  );
  const shifts = await api('/api/shifts');
  assert.equal(
    shifts.find((s) => s.id === shift.id).expectedCash,
    summary.expectedCash,
  );
  const netCash = 500000 - partial;
  assert.equal(
    shifts.find((s) => s.id === refundShift.id).expectedCash,
    netCash,
  );
  const after = await api('/api/reports');
  assert.equal(after.revenue, before.revenue);
  const method = (r, m) => r.methods.find((p) => p.id === m)?.revenue ?? 0;
  assert.equal(
    method(after, 'CASH'),
    method(before, 'CASH') + first.amount - partial,
  );
  assert.equal(
    method(after, 'BANK_TRANSFER'),
    method(before, 'BANK_TRANSFER') - first.amount + partial,
  );
  await page.goto('/print/receipt?orderId=' + order.id);
  await expect(page.getByText('HOÀN TIỀN', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Thực thu sau hoàn: 0 ₫', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path:
      (process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots') +
      '/refunded-receipt.png',
    fullPage: true,
  });
  await page.goto('/admin/audit?action=REFUND');
  await expect(
    page
      .locator('article')
      .filter({ has: page.locator('a[href="/pos?orderId=' + order.id + '"]') })
      .filter({ hasText: 'Hoàn phần còn lại' }),
  ).toBeVisible();
  assert.ok(!(await page.locator('body').innerText()).includes('REFUND'));
  assert.ok(!(await page.locator('body').innerText()).includes('1111'));
  await api('/api/shifts', 'PUT', {
    id: refundShift.id,
    countedCash: netCash,
    note: 'Refund regression',
  });
  console.log(
    'PASS refunds: owner PIN and reason required; per-item + full remainder, no over-refund, UUID replay, negative cash/QR payments, current shift only, net reports and refunded receipt; portrait checkout and orders fit',
  );
} finally {
  await browser.close();
}
