import { it, expect } from 'vitest';
import {
  printStatuses,
  ticketItems,
  thermalPageRule,
} from '../../lib/printing';
it('sizes both thermal rolls to their content height instead of a fixed A4 tail', () => {
  expect(thermalPageRule(58, 96)).toBe('@page { size: 58mm 26mm; margin: 0; }');
  expect(thermalPageRule(80, 960)).toBe(
    '@page { size: 80mm 255mm; margin: 0; }',
  );
  expect(() => thermalPageRule(80, 0)).toThrow(RangeError);
  expect(() => thermalPageRule(80, Number.NaN)).toThrow(RangeError);
});
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
