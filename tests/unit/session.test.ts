import { beforeEach, describe, it, expect } from 'vitest';
import { signSession, verifySession, ownerOnly } from '../../lib/session';
beforeEach(() => {
  process.env.AUTH_SECRET = 'test-only-secret-at-least-32-characters';
});
describe('sessions', () => {
  it('round trips signed identity', async () => {
    const session = {
      sub: 'user',
      storeId: 'store',
      name: 'Lan',
      role: 'CASHIER' as const,
    };
    expect(await verifySession(await signSession(session))).toEqual(session);
  });
  it('rejects missing, invalid and tampered tokens', async () => {
    expect(await verifySession()).toBeNull();
    expect(await verifySession('invalid')).toBeNull();
    const token = await signSession({
      sub: 'u',
      storeId: 's',
      name: 'n',
      role: 'OWNER',
    });
    expect(await verifySession(token + 'x')).toBeNull();
    process.env.AUTH_SECRET = 'different-secret-at-least-32-characters';
    expect(await verifySession(token)).toBeNull();
  });
  it('restricts management and reports, not shifts', () => {
    expect(ownerOnly('/admin/menu')).toBe(true);
    expect(ownerOnly('/reports')).toBe(true);
    expect(ownerOnly('/shifts')).toBe(false);
  });
});
