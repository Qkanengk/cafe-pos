export function printStatuses(bar: boolean): ('OPEN' | 'PAID' | 'CANCELLED')[] {
  return bar ? ['OPEN', 'PAID', 'CANCELLED'] : ['PAID'];
}
export function ticketItems<T extends { status: string }>(
  items: T[],
  bar: boolean,
) {
  return items.filter(
    (i) => i.status === 'ACTIVE' || (bar && i.status === 'VOIDED'),
  );
}
