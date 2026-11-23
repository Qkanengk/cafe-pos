import { compare, hashSync } from 'bcryptjs';
import { db } from './db';
import { HttpError } from './api';
import { pinLimiter, invalidPinLimiter, pinLockMessage } from './pin-limit';
type Credentials =
  | { mode: 'pin'; userId: string; pin: string }
  | { mode: 'password'; email: string; password: string };
const fakePinHash = hashSync('not-a-real-account', 10);
export async function authenticateLogin(data: Credentials, ip?: string) {
  const ipSuccess =
    data.mode === 'pin' ? pinLimiter.reserve([], ip) : undefined;
  if (ipSuccess === null) throw new HttpError(pinLockMessage, 429);
  const user = await db.user.findUnique({
    where:
      data.mode === 'pin'
        ? { id: data.userId }
        : { email: data.email.toLowerCase() },
  });
  if (!user?.isActive || (data.mode === 'pin' && user.role !== 'CASHIER')) {
    if (data.mode === 'pin') {
      if (!ip && !invalidPinLimiter.reserve([], 'invalid-account-work'))
        throw new HttpError(pinLockMessage, 429);
      await compare(data.pin, fakePinHash);
    }
    return null;
  }
  const success =
    data.mode === 'pin' ? pinLimiter.reserve([user.id]) : undefined;
  if (success === null) {
    ipSuccess?.();
    throw new HttpError(pinLockMessage, 429);
  }
  const valid =
    data.mode === 'pin'
      ? user.role === 'CASHIER' && (await compare(data.pin, user.pinHash))
      : user.role === 'OWNER' &&
        !!user.passwordHash &&
        (await compare(data.password, user.passwordHash));
  if (!valid) return null;
  success?.();
  ipSuccess?.();
  return user;
}
