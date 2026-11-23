import { describe, it, expect } from 'vitest';
import { voidReasonPresets, operationSchema } from '../../lib/sales-validation';
it('accepts quick void/cancel reasons and still requires a nonempty reason', () => {
  for (const reason of voidReasonPresets)
    expect(
      operationSchema.safeParse({
        action: 'CANCEL',
        version: 1,
        reason,
        ownerPin: '1111',
      }).success,
    ).toBe(true);
  expect(
    operationSchema.safeParse({
      action: 'CANCEL',
      version: 1,
      reason: '',
      ownerPin: '1111',
    }).success,
  ).toBe(false);
});
import {
  checkoutSchema,
  paymentSchema,
  openShiftSchema,
  closeShiftSchema,
} from '../../lib/sales-validation';
const id = '7ff9e456-8548-4f88-9c18-1d2b655de2ce';
describe('selling validation', () => {
  it('accepts takeaway orders and deduplicates topping IDs for idempotency', () => {
    const order = checkoutSchema.parse({
      id,
      type: 'TAKEAWAY',
      lines: [{ variantId: id, quantity: 1, toppingIds: [id, id] }],
    });
    expect(order.lines[0].toppingIds).toEqual([id]);
    expect(order.lines[0].note).toBe('');
  });
  it('rejects empty, malformed, unavailable shape and dine-in without table', () => {
    for (const invalid of [
      {},
      { id, type: 'TAKEAWAY', lines: [] },
      { id, type: 'DINE_IN', lines: [{ variantId: id, quantity: 1 }] },
      { id, type: 'TAKEAWAY', lines: [{ variantId: id, quantity: 0 }] },
    ])
      expect(checkoutSchema.safeParse(invalid).success).toBe(false);
    expect(
      checkoutSchema.safeParse({
        id,
        type: 'TAKEAWAY',
        discount: { type: 'PERCENT', value: 101 },
        lines: [{ variantId: id, quantity: 1 }],
      }).success,
    ).toBe(false);
  });
  it('requires explicit bank confirmation and nonnegative integer tender', () => {
    expect(
      paymentSchema.safeParse({ method: 'BANK_TRANSFER', confirmed: true })
        .success,
    ).toBe(true);
    expect(paymentSchema.safeParse({ method: 'BANK_TRANSFER' }).success).toBe(
      false,
    );
    expect(
      paymentSchema.safeParse({ method: 'CASH', received: 100000 }).success,
    ).toBe(true);
    expect(
      paymentSchema.safeParse({ method: 'CASH', received: -1 }).success,
    ).toBe(false);
    expect(
      paymentSchema.safeParse({ method: 'CASH', received: 0.5 }).success,
    ).toBe(false);
  });
  it('validates opening and closing counts', () => {
    expect(openShiftSchema.safeParse({ openingCash: 0 }).success).toBe(true);
    expect(openShiftSchema.safeParse({ openingCash: -1 }).success).toBe(false);
    expect(closeShiftSchema.safeParse({ id, countedCash: 0 }).success).toBe(
      true,
    );
    expect(closeShiftSchema.safeParse({ id, countedCash: 2.1 }).success).toBe(
      false,
    );
  });
});
