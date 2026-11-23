import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './api';
import type { MenuProduct, MenuTopping } from './sales-types';
export type Catalog = {
  userId: string;
  storeId: string;
  products: MenuProduct[];
  toppings: MenuTopping[];
};
function signature(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('AUTH_SECRET must contain at least 32 characters');
  return createHmac('sha256', secret)
    .update('offline-catalog:' + payload)
    .digest('base64url');
}
export function signCatalog(catalog: Catalog) {
  const payload = Buffer.from(JSON.stringify(catalog)).toString('base64url');
  return payload + '.' + signature(payload);
}
export function verifyCatalog(
  token: string,
  actor: { id: string; storeId: string },
): Catalog {
  const [payload, mac, ...rest] = token.split('.');
  const expected = payload ? signature(payload) : '';
  if (
    rest.length ||
    !mac ||
    mac.length !== expected.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  )
    throw new HttpError(
      'Thực đơn ngoại tuyến không hợp lệ. Kết nối và tải lại.',
      409,
    );
  let catalog: Catalog;
  try {
    catalog = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    throw new HttpError('Thực đơn ngoại tuyến không hợp lệ', 409);
  }
  if (catalog.userId !== actor.id || catalog.storeId !== actor.storeId)
    throw new HttpError('Thực đơn không thuộc phiên nhân viên này', 403);
  return catalog;
}
