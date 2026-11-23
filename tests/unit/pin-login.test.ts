import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), compare: vi.fn() }));
vi.mock('../../lib/db', () => ({
  db: { user: { findUnique: mocks.findUnique } },
}));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));
import { authenticateLogin } from '../../lib/login';
import { PinLimiter, pinLimiter } from '../../lib/pin-limit';
beforeEach(() => {
  vi.resetAllMocks();
  pinLimiter.clear();
  mocks.findUnique.mockResolvedValue({
    id: 'u',
    role: 'CASHIER',
    isActive: true,
    pinHash: 'hash',
  });
  mocks.compare.mockResolvedValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  pinLimiter.clear();
});
describe('PIN protection', () => {
  it('blocks a sixth user guess even from another IP, including concurrent requests', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        authenticateLogin({ mode: 'pin', userId: 'u', pin: '9999' }, 'a'),
      ),
    );
    await expect(
      authenticateLogin({ mode: 'pin', userId: 'u', pin: '2222' }, 'b'),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.compare).toHaveBeenCalledTimes(5);
  });
  it('locks an IP across user identities and unlocks after fifteen minutes', () => {
    vi.useFakeTimers();
    const limiter = new PinLimiter();
    for (let i = 0; i < 20; i++)
      expect(limiter.reserve(['u' + i], 'a')).toBeTypeOf('function');
    expect(limiter.reserve(['other'], 'a')).toBeNull();
    expect(limiter.reserve(['other'], 'b')).toBeTypeOf('function');
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(limiter.reserve(['u0'], 'a')).toBeTypeOf('function');
  });
  it('accepts cashier PIN and resets its failed user attempts', async () => {
    for (let i = 0; i < 4; i++)
      await authenticateLogin({ mode: 'pin', userId: 'u', pin: '9999' }, 'a');
    mocks.compare.mockResolvedValue(true);
    expect(
      await authenticateLogin({ mode: 'pin', userId: 'u', pin: '2222' }, 'a'),
    ).toMatchObject({ id: 'u' });
    expect(
      await authenticateLogin({ mode: 'pin', userId: 'u', pin: '2222' }, 'a'),
    ).toMatchObject({ id: 'u' });
  });
  it('never gives OWNER access using a PIN; owner password still works', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'u',
      role: 'OWNER',
      isActive: true,
      pinHash: 'hash',
      passwordHash: 'password',
    });
    mocks.compare.mockResolvedValue(true);
    expect(
      await authenticateLogin({ mode: 'pin', userId: 'u', pin: '1111' }, 'a'),
    ).toBeNull();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(
      await authenticateLogin(
        { mode: 'password', email: 'owner@cafe.local', password: 'owner123' },
        'a',
      ),
    ).toMatchObject({ role: 'OWNER' });
  });
  it('rejects unknown and inactive accounts', async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ isActive: false });
    expect(
      await authenticateLogin(
        { mode: 'pin', userId: 'missing', pin: '1111' },
        'a',
      ),
    ).toBeNull();
    expect(
      await authenticateLogin(
        { mode: 'pin', userId: 'inactive', pin: '1111' },
        'a',
      ),
    ).toBeNull();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
});
