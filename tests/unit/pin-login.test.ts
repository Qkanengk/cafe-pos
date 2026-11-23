import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), compare: vi.fn() }));
vi.mock('../../lib/db', () => ({
  db: { user: { findUnique: mocks.findUnique } },
}));
vi.mock('bcryptjs', () => ({
  compare: mocks.compare,
  hashSync: () => 'dummy-hash',
}));
import { authenticateLogin } from '../../lib/login';
import {
  PinLimiter,
  pinLimiter,
  ownerPinLimiter,
  invalidPinLimiter,
  clientIP,
} from '../../lib/pin-limit';
beforeEach(() => {
  vi.resetAllMocks();
  pinLimiter.clear();
  ownerPinLimiter.clear();
  invalidPinLimiter.clear();
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
  it('does not spend the source budget on already-locked accounts', async () => {
    for (let i = 0; i < 5; i++)
      await authenticateLogin({ mode: 'pin', userId: 'u', pin: '9999' }, 'a');
    for (let i = 0; i < 25; i++)
      await expect(
        authenticateLogin({ mode: 'pin', userId: 'u', pin: '9999' }, 'b'),
      ).rejects.toMatchObject({ status: 429 });
    expect(mocks.compare).toHaveBeenCalledTimes(5);
    mocks.findUnique.mockResolvedValue({
      id: 'other',
      role: 'CASHIER',
      isActive: true,
      pinHash: 'hash',
    });
    mocks.compare.mockResolvedValue(true);
    await expect(
      authenticateLogin({ mode: 'pin', userId: 'other', pin: '2222' }, 'b'),
    ).resolves.toMatchObject({ id: 'other' });
  });
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
    expect(mocks.compare).toHaveBeenCalledWith('1111', 'dummy-hash');
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
    expect(mocks.compare).toHaveBeenCalledTimes(2);
  });
  it('does not allocate limiter entries for made-up accounts', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const reserve = vi.spyOn(pinLimiter, 'reserve');
    for (let i = 0; i < 20; i++)
      expect(
        await authenticateLogin(
          { mode: 'pin', userId: 'unknown-' + i, pin: '0000' },
          'a',
        ),
      ).toBeNull();
    expect(reserve.mock.calls.every(([users]) => users.length === 0)).toBe(
      true,
    );
    await expect(
      authenticateLogin({ mode: 'pin', userId: 'another', pin: '0000' }, 'a'),
    ).rejects.toMatchObject({ status: 429 });
    reserve.mockRestore();
    expect(mocks.compare).toHaveBeenCalledTimes(20);
  });
  it('evicts old buckets instead of blocking unrelated users when capacity is reached', () => {
    const limiter = new PinLimiter(4);
    for (let i = 0; i < 20; i++)
      expect(limiter.reserve(['u' + i], 'ip' + i)).toBeTypeOf('function');
  });
  it('ignores spoofable IP headers unless a trusted proxy is explicitly configured', () => {
    const headers = new Headers({
      'x-forwarded-for': '8.8.8.8, 10.0.0.1',
      'x-real-ip': '1.1.1.1',
    });
    vi.stubEnv('TRUST_PROXY', '');
    expect(clientIP(headers)).toBeUndefined();
    expect(clientIP(headers, '127.0.0.1')).toBe('127.0.0.1');
    vi.stubEnv('TRUST_PROXY', 'true');
    expect(clientIP(headers)).toBe('8.8.8.8');
    vi.unstubAllEnvs();
  });
  it('does not let direct callers lock unrelated users or owner approvals', async () => {
    for (let i = 0; i < 5; i++)
      await authenticateLogin({ mode: 'pin', userId: 'u', pin: '9999' });
    mocks.findUnique.mockResolvedValue({
      id: 'other',
      role: 'CASHIER',
      isActive: true,
      pinHash: 'hash',
    });
    mocks.compare.mockResolvedValue(true);
    await expect(
      authenticateLogin({ mode: 'pin', userId: 'other', pin: '2222' }),
    ).resolves.toMatchObject({ id: 'other' });
    expect(ownerPinLimiter.reserve(['u'])).toBeTypeOf('function');
  });
  it('bounds fake bcrypt work without a trusted source address and does not block real staff', async () => {
    mocks.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 20; i++)
      await authenticateLogin({
        mode: 'pin',
        userId: 'missing-' + i,
        pin: '0000',
      });
    await expect(
      authenticateLogin({ mode: 'pin', userId: 'extra', pin: '0000' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.compare).toHaveBeenCalledTimes(20);
    mocks.findUnique.mockResolvedValue({
      id: 'active',
      role: 'CASHIER',
      isActive: true,
      pinHash: 'hash',
    });
    mocks.compare.mockResolvedValue(true);
    await expect(
      authenticateLogin({ mode: 'pin', userId: 'active', pin: '2222' }),
    ).resolves.toMatchObject({ id: 'active' });
  });
});
