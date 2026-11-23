import { it, expect, vi } from 'vitest';
import { serialPoll, orderViewChanged } from '../../lib/live-state';
it('marks externally edited, voided, merged or paid orders as stale', () => {
  const order = { id: 'one', version: 1, status: 'OPEN' };
  expect(orderViewChanged(order, { ...order })).toBe(false);
  expect(orderViewChanged(order, { ...order, version: 2 })).toBe(true);
  expect(orderViewChanged(order, { ...order, status: 'PAID' })).toBe(true);
  expect(orderViewChanged(order, { ...order, status: 'CANCELLED' })).toBe(true);
});
it('avoids overlapping polls and releases the lock after failure', async () => {
  let finish: () => void = () => {};
  const task = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('down'))
    .mockResolvedValue(undefined);
  const poll = serialPoll(task);
  const first = poll();
  await poll();
  expect(task).toHaveBeenCalledTimes(1);
  finish();
  await first;
  await expect(poll()).rejects.toThrow('down');
  await poll();
  expect(task).toHaveBeenCalledTimes(3);
});
