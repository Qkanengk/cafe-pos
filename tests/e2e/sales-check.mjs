import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
const shots = process.env.SCREENSHOT_DIR ?? '/home/ubuntu/shots';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});
const cashier = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 800 },
});
const owner = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 800 },
});
const page = await cashier.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const fmt = (value) => new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
async function api(context, path, method = 'GET', data, status = 200) {
  const r = await context.request.fetch(path, {
    method,
    ...(data === undefined ? {} : { data }),
    headers: { Origin: baseURL },
  });
  const body = await r.json();
  assert.equal(r.status(), status, path + ': ' + JSON.stringify(body));
  return body;
}
async function svgCheck(p) {
  const shapes = await p.locator('svg:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      shapes: node.querySelectorAll(
        'path,circle,line,rect,polyline,polygon,ellipse',
      ).length,
    })),
  );
  assert.ok(shapes.length > 0, 'Bundled icons should be present');
  assert.ok(
    shapes.every((s) => s.width > 0 && s.height > 0 && s.shapes > 0),
    'All visible icons must have vector shapes and dimensions',
  );
  assert.equal(
    await p
      .locator(
        'link[href*="fonts.googleapis"],link[href*="font-awesome"],link[href*="material-icons"]',
      )
      .count(),
    0,
  );
}
try {
  await api(owner, '/api/auth/login', 'POST', {
    mode: 'password',
    email: process.env.OWNER_EMAIL ?? 'owner@cafe.local',
    password: process.env.OWNER_PASSWORD ?? 'owner123',
  });
  const products = (await api(owner, '/api/admin/products'))
    .filter((p) => p.isAvailable && p.variants.some((v) => v.name === 'M'))
    .slice(0, 3);
  const topping = (await api(owner, '/api/admin/toppings')).find(
    (t) => t.isAvailable,
  );
  const users = await api(owner, '/api/admin/users');
  const lan = users.find((u) => u.name === 'Lan');
  assert.ok(
    products.length === 3 && topping && lan,
    'Three sellable products and a topping are required',
  );
  const variants = products.map((p) => p.variants.find((v) => v.name === 'M'));
  const total = variants.reduce((sum, v) => sum + v.price, 0) + topping.price;
  const op = await owner.newPage();
  await op.goto('/admin/menu');
  await expect(
    op.getByRole('button', { name: 'Thêm món', exact: true }).locator('svg'),
  ).toBeVisible();
  await svgCheck(op);
  await op.screenshot({ path: shots + '/admin-menu.png' });
  for (const path of ['/admin/staff', '/admin/settings']) {
    await op.goto(path);
    await svgCheck(op);
  }
  console.log(
    'PASS icons: admin add/availability/fallback and app header render bundled SVGs; no CDN icon fonts',
  );
  await page.goto('/login');
  await svgCheck(page);
  await page.getByLabel('Tên nhân viên').selectOption(lan.id);
  await page.getByLabel('Mã PIN', { exact: true }).fill('2222');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/pos');
  assert.equal(
    (await api(cashier, '/api/shifts')).filter((s) => !s.closedAt).length,
    0,
    'Start with no open shift',
  );
  await expect(page.getByTestId('product-tile').first()).toBeDisabled();
  const sample = {
    id: crypto.randomUUID(),
    type: 'TAKEAWAY',
    lines: [{ variantId: variants[0].id, quantity: 1 }],
  };
  await api(cashier, '/api/orders', 'POST', sample, 409);
  await api(cashier, '/api/orders', 'POST', { ...sample, lines: [] }, 400);
  console.log(
    'PASS cashier PIN login; UI and server refuse selling without an open shift; empty order=400',
  );
  await page.getByRole('link', { name: 'Ca làm việc', exact: true }).click();
  await page.getByLabel('Tiền đầu ca', { exact: true }).fill('200000');
  await page.getByRole('button', { name: 'Mở ca', exact: true }).click();
  await expect(page.getByTestId('expected-cash')).toHaveText(fmt(200000));
  const shift = (await api(cashier, '/api/shifts')).find((s) => !s.closedAt);
  await api(cashier, '/api/shifts', 'POST', { openingCash: 0 }, 409);
  await page.getByRole('link', { name: 'Tiếp tục bán hàng' }).click();
  await expect(
    page.getByRole('button', { name: 'Chọn ' + products[0].name, exact: true }),
  ).toBeEnabled();
  const started = Date.now();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole('button', { name: 'Chọn ' + products[i].name, exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: products[i].name,
      exact: true,
    });
    if (i === 0) {
      await dialog
        .getByRole('checkbox', { name: topping.name, exact: true })
        .check();
      await dialog.getByRole('button', { name: 'ít đá', exact: true }).click();
    }
    await dialog.getByRole('button', { name: /Thêm vào đơn/ }).click();
  }
  const elapsed = Date.now() - started;
  await expect(page.getByTestId('cart-line')).toHaveCount(3);
  await expect(page.getByTestId('cart-total')).toHaveText(fmt(total));
  await expect(page.getByTestId('cart-line').first()).toContainText(
    topping.name,
  );
  await expect(page.getByTestId('cart-line').first()).toContainText('ít đá');
  await svgCheck(page);
  await page.screenshot({ path: shots + '/pos.png', fullPage: false });
  console.log(
    'PASS cart: 3 takeaway items, topping and quick note in ' +
      elapsed +
      'ms of automated taps; total=' +
      total +
      ' VND',
  );
  // Exercise editing, quantity, discounts, table picker and empty search without changing the sale.
  await page
    .getByTestId('cart-line')
    .first()
    .getByRole('button')
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Tăng số lượng', exact: true })
    .click();
  await page.getByRole('button', { name: /Lưu món/ }).click();
  await expect(page.getByTestId('cart-total')).toHaveText(
    fmt(total + variants[0].price + topping.price),
  );
  await page
    .getByTestId('cart-line')
    .first()
    .getByRole('button')
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Giảm số lượng', exact: true })
    .click();
  await page.getByRole('button', { name: /Lưu món/ }).click();
  await page.getByLabel('Giảm giá', { exact: true }).fill('10');
  await expect(page.getByTestId('cart-total')).toHaveText(
    fmt(total - Math.round(total * 0.1)),
  );
  await page.getByLabel('Kiểu giảm giá').selectOption('AMOUNT');
  await page.getByLabel('Giảm giá', { exact: true }).fill('5000');
  await expect(page.getByTestId('cart-total')).toHaveText(fmt(total - 5000));
  await page.getByLabel('Giảm giá', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Tại bàn', exact: true }).click();
  await expect(page.getByLabel('Chọn bàn')).toBeVisible();
  await page.getByLabel('Chọn bàn').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Mang đi', exact: true }).click();
  await page.getByLabel('Tìm món').fill('no-such-drink-94832');
  await expect(page.getByText('Không tìm thấy món phù hợp.')).toBeVisible();
  await page.getByLabel('Tìm món').fill('');
  console.log(
    'PASS cart editing: quantity, percent/amount discounts, table picker and empty search',
  );
  const preparation = page.waitForResponse(
    (r) =>
      r.url() === baseURL + '/api/orders' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  const preparedResponse = await preparation;
  const order = await preparedResponse.json();
  assert.equal(preparedResponse.status(), 200, JSON.stringify(order));
  assert.equal(order.total, total);
  assert.match(order.id, /^[0-9a-f-]{36}$/);
  assert.match(order.code, /^CF[0-9]{8}-[0-9]{4,}$/);
  assert.equal(order.items.length, 3);
  assert.equal(order.type, 'TAKEAWAY');
  const payload = preparedResponse.request().postDataJSON();
  const replay = await api(cashier, '/api/orders', 'POST', payload);
  assert.equal(replay.id, order.id);
  await api(
    cashier,
    '/api/orders',
    'POST',
    { ...payload, note: 'changed' },
    409,
  );
  await api(
    cashier,
    '/api/shifts',
    'PUT',
    { id: shift.id, countedCash: 0 },
    409,
  );
  await api(
    cashier,
    '/api/orders/' + order.id + '/pay',
    'POST',
    { method: 'CASH', received: 1 },
    400,
  );
  const payDialog = page.getByRole('dialog', {
    name: 'Thanh toán ' + order.code,
  });
  await expect(
    payDialog.getByRole('button', { name: 'Xác nhận đã nhận tiền' }),
  ).toBeDisabled();
  const suggestions = payDialog.getByTestId('cash-suggestion');
  let tender;
  for (let i = 0; i < (await suggestions.count()); i++) {
    const button = suggestions.nth(i);
    const value = Number(
      (await button.getAttribute('aria-label')).replace('Khách đưa ', ''),
    );
    if (
      value > total &&
      [10000, 20000, 50000, 100000, 200000, 500000].includes(value)
    ) {
      tender = value;
      await button.click();
      break;
    }
  }
  assert.ok(tender > total);
  await expect(payDialog.getByTestId('cash-change')).toHaveText(
    fmt(tender - total),
  );
  await expect(
    payDialog.getByRole('button', { name: 'Xác nhận đã nhận tiền' }),
  ).toHaveCSS('opacity', '1');
  await svgCheck(page);
  await page.screenshot({ path: shots + '/payment-cash.png' });
  const paymentResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/' + order.id + '/pay') &&
      r.request().method() === 'POST',
  );
  await payDialog
    .getByRole('button', { name: 'Xác nhận đã nhận tiền' })
    .click();
  const paid = await (await paymentResponse).json();
  assert.equal(paid.payments.length, 1);
  assert.equal(paid.payments[0].confirmedBy, lan.id);
  assert.equal(paid.payments[0].change, tender - total);
  const again = await api(cashier, '/api/orders/' + order.id + '/pay', 'POST', {
    id: paid.payments[0].id,
    method: 'CASH',
    received: tender,
  });
  assert.equal(again.payments.length, 1);
  await expect(page.getByRole('status')).toContainText('Thanh toán thành công');
  console.log(
    'PASS cash: suggested ' +
      tender +
      ', total ' +
      total +
      ', change ' +
      (tender - total) +
      '; idempotent order/payment; pending-order close blocked',
  );
  const printPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'In hóa đơn', exact: true }).click();
  const receipt = await printPromise;
  await receipt.waitForLoadState();
  await expect(receipt.getByTestId('receipt-total')).toHaveText(fmt(total));
  await expect(receipt.getByTestId('receipt')).toContainText(topping.name);
  await expect(receipt.getByTestId('receipt')).toContainText('ít đá');
  await expect(receipt.getByTestId('receipt')).toContainText(
    'Người xác nhận: Lan',
  );
  await receipt.screenshot({ path: shots + '/receipt.png', fullPage: true });
  await receipt.emulateMedia({ media: 'print' });
  await expect(receipt.locator('.print-toolbar')).toBeHidden();
  assert.ok(
    Math.abs(
      (await receipt.locator('.paper').boundingBox()).width - (80 * 96) / 25.4,
    ) < 1,
  );
  const bar = await cashier.newPage();
  await bar.goto('/print/bar?orderId=' + order.id);
  await expect(bar.getByTestId('bar-ticket')).toContainText('ít đá');
  await expect(bar.getByTestId('bar-ticket')).toContainText(topping.name);
  assert.equal(await bar.getByTestId('receipt-total').count(), 0);
  const settings = await api(owner, '/api/admin/settings');
  try {
    await api(owner, '/api/admin/settings', 'PUT', {
      ...settings,
      receiptWidth: 58,
    });
    await receipt.reload();
    assert.ok(
      Math.abs(
        (await receipt.locator('.paper').boundingBox()).width -
          (58 * 96) / 25.4,
      ) < 1,
    );
  } finally {
    await api(owner, '/api/admin/settings', 'PUT', settings);
  }
  console.log(
    'PASS printing: correct receipt snapshots/total, bar ticket, print toolbar hidden, both 80mm and 58mm widths',
  );
  await page
    .getByRole('button', { name: 'Chọn ' + products[0].name, exact: true })
    .click();
  await page.getByRole('button', { name: /Thêm vào đơn/ }).click();
  const secondPreparation = page.waitForResponse(
    (r) =>
      r.url() === baseURL + '/api/orders' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  const second = await (await secondPreparation).json();
  assert.equal(second.dailyNumber, order.dailyNumber + 1);
  assert.notEqual(second.id, order.id);
  const bankDialog = page.getByRole('dialog', {
    name: 'Thanh toán ' + second.code,
  });
  await bankDialog
    .getByRole('button', { name: 'Chuyển khoản', exact: true })
    .click();
  const qr = bankDialog.getByRole('img', { name: 'Mã VietQR ' + second.code });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveJSProperty('complete', true);
  assert.ok(await qr.evaluate((img) => img.naturalWidth >= 300));
  assert.ok(
    (await qr.getAttribute('src')).startsWith('data:image/png;base64,'),
  );
  await expect(bankDialog.getByTestId('payment-total')).toHaveText(
    fmt(second.total),
  );
  await expect(
    bankDialog.getByRole('button', { name: 'Xác nhận đã nhận tiền' }),
  ).toBeDisabled();
  await api(
    cashier,
    '/api/orders/' + second.id + '/pay',
    'POST',
    { method: 'BANK_TRANSFER' },
    400,
  );
  await bankDialog.getByRole('checkbox').check();
  await expect(
    bankDialog.getByRole('button', { name: 'Xác nhận đã nhận tiền' }),
  ).toHaveCSS('opacity', '1');
  await svgCheck(page);
  await page.screenshot({ path: shots + '/payment-qr.png' });
  const bankPaidResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/' + second.id + '/pay') &&
      r.request().method() === 'POST',
  );
  await bankDialog
    .getByRole('button', { name: 'Xác nhận đã nhận tiền' })
    .click();
  const bankPaid = await (await bankPaidResponse).json();
  assert.equal(bankPaid.payments[0].method, 'BANK_TRANSFER');
  assert.equal(bankPaid.payments[0].confirmedBy, lan.id);
  assert.equal(bankPaid.payments[0].received, null);
  console.log(
    'PASS bank transfer: local VietQR image, amount/order code, explicit manual confirmation and recorded cashier; daily sequence increments',
  );
  await page.getByRole('link', { name: 'Đơn hàng', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'In hóa đơn', exact: true }).first(),
  ).toBeVisible();
  await svgCheck(page);
  await page.getByRole('link', { name: 'Ca làm việc', exact: true }).click();
  const expected = 200000 + tender - (tender - total);
  await expect(page.getByTestId('expected-cash')).toHaveText(fmt(expected));
  await page
    .getByLabel('Tiền mặt thực đếm', { exact: true })
    .fill(String(expected - 1000));
  await expect(page.getByTestId('shift-difference')).toHaveText(fmt(-1000));
  await page
    .getByLabel('Tiền mặt thực đếm', { exact: true })
    .fill(String(expected));
  await expect(page.getByTestId('shift-difference')).toHaveText(fmt(0));
  await svgCheck(page);
  await page.screenshot({ path: shots + '/shift-reconcile.png' });
  const closeResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/shifts') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Đóng ca', exact: true }).click();
  const closed = await (await closeResponse).json();
  assert.equal(closed.expectedCash, expected);
  assert.equal(closed.countedCash, expected);
  assert.equal(closed.difference, 0);
  assert.equal(closed.cashSales, total);
  assert.equal(closed.bankSales, second.total);
  assert.equal(closed.paidCount, 2);
  await expect(page.getByTestId('closed-difference')).toHaveText(fmt(0));
  await page.screenshot({ path: shots + '/shift-close.png' });
  await api(
    cashier,
    '/api/orders',
    'POST',
    { ...sample, id: crypto.randomUUID() },
    409,
  );
  console.log(
    'PASS close shift: expected=200000 + ' +
      tender +
      ' - ' +
      (tender - total) +
      ' = ' +
      expected +
      '; bank excluded; counted matches, difference=0; 2 paid orders in history',
  );
  await page.goto('/pos');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'POS fits phone width',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS responsive: POS fits 390px phone; no browser runtime errors',
  );
  console.log(
    'PASS screenshots: ' +
      [
        'pos.png',
        'payment-cash.png',
        'payment-qr.png',
        'receipt.png',
        'shift-close.png',
      ]
        .map((f) => shots + '/' + f)
        .join(', '),
  );
  console.log(
    'Sales records retained for reprinting. Shift ' +
      shift.id +
      ' is closed; settings restored.',
  );
} finally {
  await browser.close();
}
