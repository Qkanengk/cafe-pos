import { test, expect, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { sql } from './database.mjs';
const run = promisify(execFile);
test.describe('Cafe POS · Definition of Done (fresh DB)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(baseURL + '/login')).status;
          } catch {
            return 0;
          }
        },
        { timeout: 60000, message: 'Production POS must be running' },
      )
      .toBe(200);
    const counts = JSON.parse(
      sql(
        'SELECT json_build_object(\'orders\',(SELECT count(*) FROM "Order"),\'shifts\',(SELECT count(*) FROM "Shift"),\'stores\',(SELECT count(*) FROM "Store"),\'products\',(SELECT count(*) FROM "Product"));',
      ),
    );
    expect(
      counts,
      'E2E requires a fresh seeded demo DB. Never use production data; reset the disposable test database before running.',
    ).toEqual({ orders: 0, shifts: 0, stores: 1, products: 20 });
  });
  for (const [name, script] of [
    [
      'Owner admin CRUD, cashier authorization and responsive menu',
      'admin-check.mjs',
    ],
    [
      'PIN login → open shift → cash/VietQR → receipt/bar print → close shift',
      'sales-check.mjs',
    ],
    [
      'Dine-in hold/resume, split/merge/move, owner-PIN void/cancel and optimistic conflicts',
      'tables-check.mjs',
    ],
    [
      'Offline five cash sales → durable queue → retry/sync/replay → close shift → owner reports',
      'offline-check.mjs',
    ],
    ['Equal-share cash/QR payments and paid-bill refunds', 'finance-check.mjs'],
  ]) {
    test(name, async ({ browserName }, testInfo) => {
      expect(browserName).toBe('chromium');
      const shots = testInfo.outputPath('screenshots');
      let output = '';
      try {
        const result = await run(
          process.execPath,
          [path.join('tests/e2e', script)],
          {
            env: {
              ...process.env,
              BASE_URL: process.env.BASE_URL ?? 'http://localhost:3000',
              CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
              SCREENSHOT_DIR: shots,
              SCREENSHOT_PATH: path.join(shots, 'admin-menu.png'),
              EXPECT_FRESH_PRICES: '1',
            },
            timeout: 150000,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
        output = result.stdout + result.stderr;
        console.log(output.trim());
      } catch (error) {
        const failed = error as Error & { stdout?: string; stderr?: string };
        output = (failed.stdout ?? '') + (failed.stderr ?? '');
        console.log(output.trim());
        throw error;
      } finally {
        await testInfo.attach('verification-output', {
          body: output,
          contentType: 'text/plain',
        });
        for (const file of await readdir(shots).catch(() => [])) {
          if (file.endsWith('.png'))
            await testInfo.attach(file, {
              path: path.join(shots, file),
              contentType: 'image/png',
            });
        }
      }
    });
  }
});
