export function thermalPageRule(width: 58 | 80, heightPx: number) {
  if (![58, 80].includes(width) || !Number.isFinite(heightPx) || heightPx <= 0)
    throw new RangeError('Khổ giấy hoặc chiều cao phiếu không hợp lệ');
  return (
    '@page { size: ' +
    width +
    'mm ' +
    Math.ceil((heightPx * 25.4) / 96 + 0.5) +
    'mm; margin: 0; }'
  );
}
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
