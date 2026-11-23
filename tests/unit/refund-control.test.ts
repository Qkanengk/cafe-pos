import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RefundControl } from '../../components/pos/refund-control';
import type { SaleOrder } from '../../lib/sales-types';
const state = vi.hoisted(() => ({ slot: 0, error: '' }));
vi.mock('react', async () => ({
  ...(await vi.importActual('react')),
  useState: (initial: unknown) => [
    state.slot++ === 7
      ? state.error
      : typeof initial === 'function'
        ? initial()
        : initial,
    () => {},
  ],
}));
const message =
  'Hóa đơn đã thay đổi. Chưa ghi khoản hoàn này; không trả thêm tiền.';
beforeEach(() => {
  state.slot = 0;
  state.error = message;
});
function render(refunded: number) {
  const order = {
    total: 10000,
    items: [
      {
        id: 'item',
        status: 'ACTIVE',
        quantity: 2,
        priceSnapshot: 5000,
        toppings: [],
      },
    ],
    refunds: refunded
      ? [
          {
            id: 'refund',
            amount: refunded,
            reason: 'Máy khác hoàn tiền',
            items: [
              { itemId: 'item', quantity: refunded / 5000, amount: refunded },
            ],
          },
        ]
      : [],
  } as unknown as SaleOrder;
  return renderToStaticMarkup(
    createElement(RefundControl, { order, onChange: vi.fn() }),
  );
}
it('keeps the rejection visible when the refreshed bill is fully refunded and the form disappears', () => {
  const html = render(10000);
  expect(html).toContain(message);
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('<details');
  expect(html).not.toContain('Xác nhận đã hoàn');
});
it('puts rejection notices outside the collapsible form when a remainder is still refundable', () => {
  const html = render(5000);
  expect(html).toContain(message);
  expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('<details'));
});
it('renders a completed bill without a phantom alert when no attempt was rejected', () => {
  state.error = '';
  const html = render(10000);
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain('<details');
  expect(html).toContain('Máy khác hoàn tiền');
});
