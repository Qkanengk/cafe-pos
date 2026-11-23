import { it, expect } from 'vitest';
import { printStatuses, ticketItems } from '../../lib/printing';
it('permits preparation before payment but never represents an open bill as a paid receipt', () => {
  expect(printStatuses(true)).toContain('OPEN');
  expect(printStatuses(false)).toEqual(['PAID']);
});
it('communicates voids only on preparation tickets, including an empty or fully voided bill', () => {
  const items = [
    { id: 'a', status: 'ACTIVE' },
    { id: 'v', status: 'VOIDED' },
  ];
  expect(ticketItems(items, true)).toEqual(items);
  expect(ticketItems(items, false)).toEqual([items[0]]);
  expect(ticketItems([], true)).toEqual([]);
  expect(ticketItems([{ status: 'VOIDED' }], true)).toHaveLength(1);
});
