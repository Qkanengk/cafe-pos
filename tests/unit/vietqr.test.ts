import { describe, it, expect } from 'vitest';
import { crc16, buildVietQR, renderVietQR } from '../../lib/vietqr';
const input = {
  bankBin: '970436',
  account: '0123456789',
  amount: 35000,
  orderCode: 'CF001',
};
describe('VietQR', () => {
  it('matches the CRC16-CCITT-FALSE check vector', () => {
    expect(crc16('123456789')).toBe('29B1');
    expect(crc16('')).toBe('FFFF');
  });
  it('encodes NAPAS bank, service, currency, amount and order code', () => {
    const payload = buildVietQR(input);
    expect(payload).toContain('0010A000000727');
    expect(payload).toContain('000697043601100123456789');
    expect(payload).toContain('0208QRIBFTTA');
    expect(payload).toContain('53037045405350005802VN62090805CF0016304');
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });
  it('renders a local PNG data URL', async () => {
    expect(await renderVietQR(input)).toMatch(/^data:image\/png;base64,/);
  });
  it('accepts zero and rejects empty or invalid fields', () => {
    expect(buildVietQR({ ...input, amount: 0 })).toContain('54010');
    for (const invalid of [
      { bankBin: '' },
      { account: '' },
      { orderCode: '' },
      { orderCode: 'đơn' },
      { amount: -1 },
      { amount: 1.5 },
    ])
      expect(() => buildVietQR({ ...input, ...invalid })).toThrow();
  });
});
