import QRCode from 'qrcode';
import { vnd } from './money';
export function crc16(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function field(id: string, value: string) {
  const length = new TextEncoder().encode(value).length;
  if (length > 99) throw new RangeError('EMV field too long');
  return id + String(length).padStart(2, '0') + value;
}
export type VietQRInput = {
  bankBin: string;
  account: string;
  amount: number;
  orderCode: string;
};
export function buildVietQR({
  bankBin,
  account,
  amount,
  orderCode,
}: VietQRInput): string {
  vnd(amount);
  if (!/^[0-9]{6}$/.test(bankBin) || !/^[0-9]{1,19}$/.test(account))
    throw new Error('Invalid bank account');
  if (!/^[A-Za-z0-9 -]{1,25}$/.test(orderCode))
    throw new Error('Order code must be 1–25 ASCII characters');
  const bank = field('00', bankBin) + field('01', account);
  const merchant =
    field('00', 'A000000727') + field('01', bank) + field('02', 'QRIBFTTA');
  const payload =
    field('00', '01') +
    field('01', '12') +
    field('38', merchant) +
    field('53', '704') +
    field('54', String(amount)) +
    field('58', 'VN') +
    field('62', field('08', orderCode)) +
    '6304';
  return payload + crc16(payload);
}
export async function renderVietQR(input: VietQRInput): Promise<string> {
  return QRCode.toDataURL(buildVietQR(input), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  });
}
