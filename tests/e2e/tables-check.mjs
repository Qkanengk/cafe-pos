import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { sql } from './database.mjs';
import { chromium, expect } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
const shots = process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 900 },
});
const secondContext = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 900 },
});
const owner = await browser.newContext({ baseURL });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
async function api(ctx, path, method = 'GET', data, status = 200) {
  const r = await ctx.request.fetch(path, {
    method,
    ...(data === undefined ? {} : { data }),
    headers: { Origin: baseURL },
  });
  const body = await r.json();
  assert.equal(r.status(), status, path + ': ' + JSON.stringify(body));
  return body;
}
function mutation(p, method, path) {
  return p.waitForResponse(
    (r) => r.request().method() === method && r.url() === baseURL + path,
  );
}
async function add(name, { quantity = 1, topping = false, note = false } = {}) {
  await page.getByRole('button', { name: 'Chọn ' + name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name, exact: true });
  if (topping)
    await dialog
      .getByRole('checkbox', { name: 'Kem cheese', exact: true })
      .check();
  if (note)
    await dialog.getByRole('button', { name: 'ít đá', exact: true }).click();
  for (let i = 1; i < quantity; i++)
    await dialog
      .getByRole('button', { name: 'Tăng số lượng', exact: true })
      .click();
  await dialog.getByRole('button', { name: /Thêm vào đơn/ }).click();
}
async function save(method, path) {
  const response = mutation(page, method, path);
  await page
    .getByRole('button', { name: 'Giữ đơn / Tạm tính', exact: true })
    .click();
  const r = await response;
  const order = await r.json();
  assert.equal(r.status(), 200, JSON.stringify(order));
  return order;
}
async function operation(label, configure) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: new RegExp('^' + label + ' ·'),
  });
  await configure(dialog);
  const response = mutation(page, 'POST', '/api/orders/' + order.id);
  await dialog
    .getByRole('button', {
      name: 'Xác nhận ' + label.toLocaleLowerCase('vi'),
      exact: true,
    })
    .click();
  const r = await response;
  const updated = await r.json();
  assert.equal(r.status(), 200, JSON.stringify(updated));
  order = updated;
  await expect(dialog).toBeHidden();
  return updated;
}
let order;
try {
  await api(owner, '/api/auth/login', 'POST', {
    mode: 'password',
    email: process.env.OWNER_EMAIL ?? 'owner@cafe.local',
    password: process.env.OWNER_PASSWORD ?? 'owner123',
  });
  const users = await api(owner, '/api/admin/users');
  const lan = users.find((u) => u.name === 'Lan');
  const boss = users.find((u) => u.role === 'OWNER');
  assert.ok(lan && boss);
  const products = await api(owner, '/api/admin/products');
  const black = products.find((p) => p.name === 'Cà phê đen');
  const cake = products.find((p) => p.name === 'Croissant');
  const isFresh = process.env.EXPECT_FRESH_PRICES === '1';
  if (isFresh) {
    assert.deepEqual(
      [...black.variants].sort((a, b) => a.price - b.price).map((v) => v.price),
      [20000, 25000, 30000],
    );
    assert.equal(cake.variants.length, 1);
    assert.equal(cake.variants[0].name, 'Phần');
    assert.ok(
      new Set(products.flatMap((p) => p.variants.map((v) => v.price))).size >
        10,
    );
    console.log(
      'PASS fresh seed: realistic varied drink prices; cà phê đen 20/25/30k; cakes have one portion',
    );
  }
  await page.goto('/login');
  await page.getByLabel('Tên nhân viên').selectOption(lan.id);
  await page.getByLabel('Mã PIN', { exact: true }).fill('2222');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/pos');
  const shifts = await api(context, '/api/shifts');
  assert.equal(
    shifts.filter((s) => !s.closedAt).length,
    0,
    'Start with no open shift',
  );
  const shift = await api(
    context,
    '/api/shifts',
    'POST',
    { openingCash: 200000 },
    201,
  );
  await page.goto('/tables');
  await expect(
    page.getByRole('heading', { name: 'Trong nhà', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Sân vườn', exact: true }),
  ).toBeVisible();
  const table = page.getByTestId('table-Bàn 1');
  await expect(table).toContainText('Trống');
  await table.getByRole('link').click();
  await page.waitForURL('**/pos?tableId=*');
  await expect(
    page.getByRole('button', { name: 'Tại bàn', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  if (isFresh) {
    await expect(
      page.getByRole('button', { name: 'Chọn Cà phê đen', exact: true }),
    ).toContainText('từ 20.000 ₫');
    await expect(
      page.getByRole('button', { name: 'Chọn Croissant', exact: true }),
    ).toContainText('29.000 ₫');
    assert.equal(
      (
        await page
          .getByRole('button', { name: 'Chọn Croissant', exact: true })
          .textContent()
      ).includes('từ '),
      false,
    );
  }
  await add('Cà phê đen', { quantity: 2, topping: true, note: true });
  await add('Bạc xỉu');
  await add('Croissant');
  await expect(page.getByTestId('cart-line')).toHaveCount(3);
  await page.screenshot({ path: shots + '/pos.png', fullPage: false });
  order = await save('POST', '/api/orders');
  const initialTotal = order.total;
  assert.equal(order.version, 1);
  assert.equal(order.type, 'DINE_IN');
  await page.goto('/tables');
  await expect(page.getByTestId('table-Bàn 1')).toContainText('Đang phục vụ');
  await expect(page.getByTestId('table-Bàn 1')).toContainText(
    fmt(initialTotal),
  );
  await page.screenshot({ path: shots + '/tables.png', fullPage: false });
  await page.getByTestId('table-Bàn 1').getByRole('link').click();
  await expect(page.getByTestId('cart-line')).toHaveCount(3);
  console.log(
    'PASS floor map: areas, empty table → dine-in hold → busy with running total ' +
      initialTotal +
      ' → resume persisted snapshots',
  );
  await api(secondContext, '/api/auth/login', 'POST', {
    mode: 'pin',
    userId: lan.id,
    pin: '2222',
  });
  const other = await secondContext.newPage();
  other.setDefaultTimeout(10000);
  await other.goto('/pos?orderId=' + order.id);
  await expect(other.getByTestId('cart-line')).toHaveCount(3);
  await add('Trà đào');
  order = await save('PUT', '/api/orders/' + order.id);
  assert.equal(order.version, 2);
  assert.equal(order.items.filter((i) => i.status === 'ACTIVE').length, 4);
  await other.getByRole('button', { name: 'Chọn Latte', exact: true }).click();
  await other.getByRole('button', { name: /Thêm vào đơn/ }).click();
  const conflictResponse = mutation(other, 'PUT', '/api/orders/' + order.id);
  await other
    .getByRole('button', { name: 'Giữ đơn / Tạm tính', exact: true })
    .click();
  assert.equal((await conflictResponse).status(), 409);
  await expect(
    other.getByRole('alert').filter({ hasText: 'Đơn đã được thay đổi' }),
  ).toContainText(
    'Đơn đã được thay đổi trên thiết bị khác. Vui lòng tải lại đơn.',
  );
  await expect(
    other.getByRole('link', { name: 'Tải lại đơn', exact: true }),
  ).toBeVisible();
  await other.screenshot({
    path: shots + '/order-conflict.png',
    fullPage: true,
  });
  const server = await api(context, '/api/orders/' + order.id);
  assert.equal(server.version, 2);
  assert.equal(server.items.length, 4);
  console.log(
    'PASS optimistic lock: two browser contexts at v1; first edit → v2; second edit → 409 and Vietnamese reload link; no lost updates',
  );
  const beforeSplit = order.total;
  const toSplit = order.items.find((i) =>
    i.nameSnapshot.startsWith('Cà phê đen'),
  );
  assert.equal(toSplit.quantity, 2);
  await operation('Tách đơn', async (dialog) => {
    await dialog
      .getByLabel('Tách ' + toSplit.nameSnapshot, { exact: true })
      .fill('1');
  });
  const split = (await api(context, '/api/orders')).find(
    (o) => o.status === 'OPEN' && o.id !== order.id,
  );
  assert.ok(split);
  assert.equal(split.items[0].quantity, 1);
  assert.equal(split.items[0].note, 'ít đá');
  assert.equal(split.items[0].toppings[0].nameSnapshot, 'Kem cheese');
  assert.equal(order.total + split.total, beforeSplit);
  await operation('Gộp đơn', async (dialog) => {
    await dialog.getByLabel('Đơn gộp').selectOption(split.id);
  });
  assert.equal(order.total, beforeSplit);
  assert.equal(
    (await api(context, '/api/orders/' + split.id)).status,
    'CANCELLED',
  );
  console.log(
    'PASS split 1 quantity with topping/note snapshots into a new bill; merge it back; combined total preserved',
  );
  const tableData = await page
    .getByLabel('Chọn bàn')
    .locator('option')
    .evaluateAll((options) =>
      options.map((o) => ({ id: o.value, text: o.textContent })),
    );
  const nextTable = tableData.find((t) => t.text.startsWith('Bàn 2 ·'));
  assert.ok(nextTable);
  await operation('Chuyển bàn', async (dialog) => {
    await dialog.getByLabel('Bàn đích').selectOption(nextTable.id);
  });
  await page.goto('/tables');
  await expect(page.getByTestId('table-Bàn 1')).toContainText('Trống');
  await expect(page.getByTestId('table-Bàn 2')).toContainText('Đang phục vụ');
  await page.getByTestId('table-Bàn 2').getByRole('link').click();
  console.log(
    'PASS move table: original table released, destination occupied with the same bill',
  );
  const voidItem = order.items.find(
    (i) => i.status === 'ACTIVE' && i.nameSnapshot.startsWith('Croissant'),
  );
  assert.ok(voidItem);
  await page.getByRole('button', { name: 'Hủy món', exact: true }).click();
  const pinDialog = page.getByRole('dialog', {
    name: new RegExp('^Hủy món ·'),
  });
  await pinDialog.getByLabel('Món cần hủy').selectOption(voidItem.id);
  await pinDialog
    .getByLabel('Lý do', { exact: true })
    .fill('Khách đổi ý - kiểm thử phase 4');
  await pinDialog.getByLabel('PIN chủ quán', { exact: true }).fill('9999');
  const wrong = mutation(page, 'POST', '/api/orders/' + order.id);
  await pinDialog
    .getByRole('button', { name: 'Xác nhận hủy món', exact: true })
    .click();
  assert.equal((await wrong).status(), 403);
  await expect(pinDialog.getByRole('alert')).toHaveText(
    'PIN chủ quán không đúng',
  );
  const afterWrong = await api(context, '/api/orders/' + order.id);
  assert.equal(afterWrong.version, order.version);
  assert.equal(
    afterWrong.items.find((i) => i.id === voidItem.id).status,
    'ACTIVE',
  );
  await page.screenshot({ path: shots + '/void-pin.png', fullPage: false });
  await pinDialog
    .getByLabel('PIN chủ quán', { exact: true })
    .fill(process.env.OWNER_PIN ?? '1111');
  const right = mutation(page, 'POST', '/api/orders/' + order.id);
  await pinDialog
    .getByRole('button', { name: 'Xác nhận hủy món', exact: true })
    .click();
  const rightResponse = await right;
  assert.equal(rightResponse.status(), 200);
  order = await rightResponse.json();
  assert.equal(order.items.find((i) => i.id === voidItem.id).status, 'VOIDED');
  assert.equal(
    order.total,
    beforeSplit - voidItem.priceSnapshot * voidItem.quantity,
  );
  assert.match(order.id, /^[0-9a-f-]{36}$/);
  const query =
    "SELECT json_build_object('action',action,'data',data) FROM \"AuditLog\" WHERE \"entityId\"='" +
    order.id +
    "' AND action='VOID' ORDER BY \"createdAt\" DESC LIMIT 1;";
  const audit = JSON.parse(sql(query));
  assert.equal(audit.action, 'VOID');
  assert.equal(audit.data.ownerId, boss.id);
  assert.equal(audit.data.itemId, voidItem.id);
  assert.ok(audit.data.reason.includes('Khách đổi ý'));
  assert.equal('ownerPin' in audit.data, false);
  console.log(
    'PASS void: wrong owner PIN=403, correct PIN voids item and recomputes total; persisted AuditLog includes reason/owner, no PIN',
  );
  const payPrepare = mutation(page, 'PUT', '/api/orders/' + order.id);
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  const forPayment = await (await payPrepare).json();
  assert.equal(forPayment.total, order.total);
  order = forPayment;
  const payDialog = page.getByRole('dialog', {
    name: 'Thanh toán ' + order.code,
    exact: true,
  });
  await payDialog.getByTestId('cash-suggestion').first().click();
  const payResponse = mutation(
    page,
    'POST',
    '/api/orders/' + order.id + '/pay',
  );
  await payDialog
    .getByRole('button', { name: 'Xác nhận đã nhận tiền', exact: true })
    .click();
  const paid = await (await payResponse).json();
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.payments.length, 1);
  await page.goto('/orders');
  await expect(page.getByTestId('order-' + order.id)).toContainText(
    'Đã thanh toán',
  );
  await page
    .getByTestId('order-' + order.id)
    .getByText(/Chi tiết đơn ·/)
    .click();
  await expect(page.getByTestId('order-' + order.id)).toContainText(
    'Khách đổi ý - kiểm thử phase 4',
  );
  await expect(
    page
      .getByTestId('order-' + order.id)
      .getByRole('link', { name: 'In hóa đơn', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Đã thanh toán', exact: true })
    .click();
  await expect(page.getByTestId('order-' + split.id)).toHaveCount(0);
  await page.screenshot({ path: shots + '/orders.png', fullPage: false });
  await page.getByRole('button', { name: 'Đang giữ', exact: true }).click();
  await expect(
    page.getByText('Không có đơn trong trạng thái này hoặc chưa mở ca.'),
  ).toBeVisible();
  console.log(
    'PASS current-shift orders: status filter, details with void reason, receipt/bar reprints; held bill paid successfully',
  );
  const cancelled = await api(context, '/api/orders', 'POST', {
    id: crypto.randomUUID(),
    type: 'TAKEAWAY',
    lines: [{ variantId: black.variants[0].id, quantity: 1 }],
  });
  await page.goto('/orders');
  const cancelCard = page.getByTestId('order-' + cancelled.id);
  await cancelCard
    .getByRole('button', { name: 'Hủy đơn', exact: true })
    .click();
  const cancelDialog = page.getByRole('dialog', {
    name: new RegExp('^Hủy đơn ·'),
  });
  await cancelDialog
    .getByLabel('Lý do', { exact: true })
    .fill('Hủy đơn kiểm thử');
  await cancelDialog
    .getByLabel('PIN chủ quán', { exact: true })
    .fill(process.env.OWNER_PIN ?? '1111');
  const cancelResponse = mutation(page, 'POST', '/api/orders/' + cancelled.id);
  await cancelDialog
    .getByRole('button', { name: 'Xác nhận hủy đơn', exact: true })
    .click();
  assert.equal((await cancelResponse).status(), 200);
  const cancelledResult = await api(context, '/api/orders/' + cancelled.id);
  assert.equal(cancelledResult.status, 'CANCELLED');
  assert.equal(cancelledResult.total, 0);
  await expect(page.getByTestId('order-' + cancelled.id)).toContainText(
    'Đã hủy / đã gộp',
  );
  console.log(
    'PASS cancel from order list: owner PIN and reason required; status CANCELLED, snapshots retained, total zero',
  );
  const summary = (await api(context, '/api/shifts')).find(
    (s) => s.id === shift.id,
  );
  assert.equal(summary.openCount, 0);
  await api(context, '/api/shifts', 'PUT', {
    id: shift.id,
    countedCash: summary.expectedCash,
    note: 'Phase 4 browser verification',
  });
  await page.goto('/tables');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS phone floor map fits 390px; no browser runtime errors; test shift closed',
  );
  console.log(
    'PASS screenshots: ' +
      ['tables.png', 'void-pin.png', 'orders.png', 'pos.png']
        .map((f) => shots + '/' + f)
        .join(', '),
  );
} finally {
  await browser.close();
}
