import { compare } from 'bcryptjs';
import { db } from './db';
import { HttpError } from './api';
import { pinLimiter, pinLockMessage } from './pin-limit';
type Credentials =
  | { mode: 'pin'; userId: string; pin: string }
  | { mode: 'password'; email: string; password: string };
export async function authenticateLogin(data: Credentials, ip: string) {
  const success =
    data.mode === 'pin' ? pinLimiter.reserve([data.userId], ip) : undefined;
  if (success === null) throw new HttpError(pinLockMessage, 429);
  const user = await db.user.findUnique({
    where:
      data.mode === 'pin'
        ? { id: data.userId }
        : { email: data.email.toLowerCase() },
  });
  if (!user?.isActive) return null;
  const valid =
    data.mode === 'pin'
      ? user.role === 'CASHIER' && (await compare(data.pin, user.pinHash))
      : user.role === 'OWNER' &&
        !!user.passwordHash &&
        (await compare(data.password, user.passwordHash));
  if (!valid) return null;
  success?.();
  return user;
}
