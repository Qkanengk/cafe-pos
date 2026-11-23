import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
const screenshot = process.env.SCREENSHOT_PATH ?? 'test-results/admin-menu.png';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});
const owner = await browser.newContext({
  baseURL,
  viewport: { width: 1280, height: 800 },
});
const cashier = await browser.newContext({ baseURL });
const created = [];
const stamp = Date.now();
let originalSettings;
async function call(context, resource, method = 'GET', data, status = 200) {
  const response = await context.request.fetch('/api/admin/' + resource, {
    method,
    ...(data ? { data } : {}),
    headers: { Origin: baseURL },
  });
  const body = await response.json();
  assert.equal(
    response.status(),
    status,
    resource + ' ' + method + ': ' + JSON.stringify(body),
  );
  return body;
}
try {
  const login = await owner.request.post('/api/auth/login', {
    data: {
      mode: 'password',
      email: process.env.OWNER_EMAIL ?? 'owner@cafe.local',
      password: process.env.OWNER_PASSWORD ?? 'owner123',
    },
    headers: { Origin: baseURL },
  });
  assert.equal(login.status(), 200);
  const users = await call(owner, 'users');
  assert.ok(
    users.every((user) => !('pinHash' in user) && !('passwordHash' in user)),
  );
  const lan = users.find((user) => user.name === 'Lan');
  assert.ok(lan);
  const cashierLogin = await cashier.request.post('/api/auth/login', {
    data: { mode: 'pin', userId: lan.id, pin: '2222' },
  });
  assert.equal(cashierLogin.status(), 200);
  for (const resource of [
    'categories',
    'products',
    'toppings',
    'users',
    'settings',
  ]) {
    await call(cashier, resource, 'GET', undefined, 403);
    await call(cashier, resource, 'POST', {}, 403);
  }
  console.log(
    'PASS cashier: all 5 admin endpoints reject reads and writes with 403',
  );
  const cashierPage = await cashier.newPage();
  await cashierPage.goto('/admin/menu');
  assert.ok(cashierPage.url().endsWith('/pos'));
  await cashierPage.close();
  console.log('PASS cashier: /admin/menu redirects to /pos');

  const page = await owner.newPage();
  await page.goto('/admin/menu');
  await page.getByRole('tab', { name: /Danh mục/ }).click();
  await page.getByRole('button', { name: /Thêm danh mục/ }).click();
  await page
    .getByLabel('Tên danh mục', { exact: true })
    .fill('Đặc biệt ' + stamp);
  await page.getByLabel('Thứ tự hiển thị', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('status').waitFor();
  const category = (await call(owner, 'categories')).find(
    (row) => row.name === 'Đặc biệt ' + stamp,
  );
  assert.ok(category);
  created.push(['categories', category.id]);
  console.log('PASS owner UI: create category with sort order');
  await page.getByRole('tab', { name: /Món uống/ }).click();
  await page.getByRole('button', { name: /Thêm món/ }).click();
  await page.getByLabel('Tên món', { exact: true }).fill('Cà phê muối');
  await page.getByLabel('Danh mục', { exact: true }).selectOption(category.id);
  for (const [size, price] of [
    ['S', '28000'],
    ['M', '33000'],
    ['L', '38000'],
  ])
    await page
      .getByLabel('Giá size ' + size + ' (₫)', { exact: true })
      .fill(price);
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('status').waitFor();
  const product = (await call(owner, 'products')).find(
    (row) => row.categoryId === category.id,
  );
  assert.ok(product);
  created.push(['products', product.id]);
  assert.equal(product.variants.length, 3);
  assert.deepEqual(product.variants.map((v) => v.name).sort(), ['L', 'M', 'S']);
  console.log('PASS owner UI: create product with S/M/L variants');
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Cà phê muối', exact: true }),
  });
  await card
    .getByRole('button', { name: 'Đánh dấu hết hàng Cà phê muối', exact: true })
    .click();
  await card
    .getByRole('button', { name: 'Mở bán Cà phê muối', exact: true })
    .waitFor();
  const unavailable = (await call(owner, 'products')).find(
    (row) => row.id === product.id,
  );
  assert.equal(unavailable.isAvailable, false);
  console.log('PASS owner UI: one-tap unavailable toggle persists');

  await call(owner, 'categories', 'DELETE', { id: category.id }, 409);
  await call(
    owner,
    'products',
    'POST',
    { name: '', categoryId: category.id },
    400,
  );
  console.log(
    'PASS validation: referenced category deletion=409; invalid product=400',
  );

  const topping = await call(
    owner,
    'toppings',
    'POST',
    { name: 'Kem thử ' + stamp, price: 5000, isAvailable: true },
    201,
  );
  created.push(['toppings', topping.id]);
  await call(owner, 'toppings', 'PUT', {
    id: topping.id,
    name: 'Kem thử ' + stamp,
    price: 6000,
    isAvailable: true,
  });
  const toggled = await call(owner, 'toppings', 'PATCH', {
    id: topping.id,
    isAvailable: false,
  });
  assert.equal(toggled.isAvailable, false);
  console.log('PASS toppings: create, update price, toggle unavailable');
  const staffData = {
    name: 'Thử nghiệm ' + stamp,
    role: 'CASHIER',
    isActive: true,
    email: '',
    pin: '3456',
    password: '',
  };
  const staff = await call(owner, 'users', 'POST', staffData, 201);
  created.push(['users', staff.id]);
  assert.ok(!('pinHash' in staff));
  const staffContext = await browser.newContext({ baseURL });
  assert.equal(
    (
      await staffContext.request.post('/api/auth/login', {
        data: { mode: 'pin', userId: staff.id, pin: '3456' },
      })
    ).status(),
    200,
  );
  await call(owner, 'users', 'PUT', {
    ...staffData,
    id: staff.id,
    pin: '6543',
    isActive: false,
  });
  assert.equal(
    (await staffContext.request.get('/pos', { maxRedirects: 0 })).status(),
    307,
  );
  assert.equal(
    (
      await staffContext.request.post('/api/auth/login', {
        data: { mode: 'pin', userId: staff.id, pin: '6543' },
      })
    ).status(),
    401,
  );
  await call(owner, 'users', 'PUT', {
    ...staffData,
    id: staff.id,
    pin: '',
    isActive: true,
  });
  assert.equal(
    (
      await staffContext.request.post('/api/auth/login', {
        data: { mode: 'pin', userId: staff.id, pin: '3456' },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await staffContext.request.post('/api/auth/login', {
        data: { mode: 'pin', userId: staff.id, pin: '6543' },
      })
    ).status(),
    200,
  );
  await staffContext.close();
  console.log(
    'PASS staff: create, PIN reset, deactivate, reject existing session, reactivate',
  );

  originalSettings = await call(owner, 'settings');
  const updated = await call(owner, 'settings', 'PUT', {
    ...originalSettings,
    receiptWidth: 58,
    receiptFooter: 'Cảm ơn quý khách!',
  });
  assert.equal(updated.receiptWidth, 58);
  await call(owner, 'settings', 'PUT', originalSettings);
  originalSettings = undefined;
  console.log(
    'PASS settings: update 58mm paper and footer; restore original settings',
  );

  await page.getByLabel('Lọc danh mục').selectOption(category.id);
  await card
    .getByRole('button', { name: 'Mở bán Cà phê muối', exact: true })
    .waitFor();
  await mkdir(dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log('PASS tablet menu screenshot: ' + screenshot);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Thêm món/ }).click();
  await page.getByLabel('Tên món', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  console.log('PASS phone: menu and editor fit 390px viewport');
} finally {
  if (originalSettings) await call(owner, 'settings', 'PUT', originalSettings);
  for (const [resource, id] of created.reverse())
    await call(owner, resource, 'DELETE', { id });
  console.log('PASS cleanup: removed all test-created records');
  await browser.close();
}
