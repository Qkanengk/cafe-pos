import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { compare } from 'bcryptjs';
const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  });
  const db = {
    user: model(),
    category: model(),
    product: model(),
    productVariant: model(),
    topping: model(),
    store: model(),
    auditLog: model(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { db, verify: vi.fn() };
});
vi.mock('../../lib/db', () => ({ db: mocks.db }));
vi.mock('../../lib/session', () => ({
  COOKIE_NAME: 'cafe_session',
  verifySession: mocks.verify,
}));
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed-secret'),
  compare: vi.fn(),
}));
import { adminRequest } from '../../lib/admin-api';
const id = '7ff9e456-8548-4f88-9c18-1d2b655de2ce';
const ownerId = '8ff9e456-8548-4f88-9c18-1d2b655de2ce';
function request(method = 'GET', body?: unknown, origin?: string) {
  return new NextRequest('http://localhost:3000/api/admin/categories', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compare).mockResolvedValue(false as never);
  mocks.verify.mockResolvedValue({
    sub: ownerId,
    storeId: 'store',
    role: 'OWNER',
  });
  for (const model of [
    mocks.db.user,
    mocks.db.category,
    mocks.db.product,
    mocks.db.productVariant,
    mocks.db.topping,
    mocks.db.store,
  ]) {
    model.findFirst.mockResolvedValue({
      id,
      name: 'Record',
      storeId: 'store',
      role: 'OWNER',
      isActive: true,
    });
    model.findMany.mockResolvedValue([]);
    model.create.mockResolvedValue({ id, name: 'Record' });
    model.update.mockResolvedValue({ id, name: 'Record' });
    model.delete.mockResolvedValue({ id, name: 'Record' });
    model.findUniqueOrThrow.mockResolvedValue({ id, name: 'Record' });
  }
  mocks.db.user.findFirst.mockResolvedValue({
    id: ownerId,
    storeId: 'store',
    role: 'OWNER',
    isActive: true,
  });
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
});
describe('owner admin API', () => {
  it('rejects duplicate active PINs within the store before writing', async () => {
    mocks.db.user.findMany.mockResolvedValueOnce([{ pinHash: 'another-hash' }]);
    vi.mocked(compare).mockResolvedValueOnce(true as never);
    const response = await adminRequest(
      request('POST', {
        name: 'New',
        role: 'CASHIER',
        isActive: true,
        email: '',
        pin: '2222',
        password: '',
      }),
      'users',
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('PIN đã được');
    expect(mocks.db.user.create).not.toHaveBeenCalled();
    expect(mocks.db.user.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store', isActive: true },
      select: { pinHash: true },
    });
  });
  it('requires a PIN recheck when an inactive account is reactivated', async () => {
    mocks.db.user.findUniqueOrThrow.mockResolvedValueOnce({
      id,
      isActive: false,
      pinHash: 'old',
    });
    const response = await adminRequest(
      request('PUT', {
        id,
        name: 'Old',
        role: 'CASHIER',
        isActive: true,
        email: '',
        pin: '',
        password: '',
      }),
      'users',
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Nhập lại PIN');
  });
  it('requires a live owner account, not just JWT claims', async () => {
    mocks.verify.mockResolvedValueOnce(null);
    expect((await adminRequest(request(), 'categories')).status).toBe(401);
    mocks.db.user.findFirst.mockResolvedValueOnce(null);
    expect((await adminRequest(request(), 'categories')).status).toBe(401);
    mocks.db.user.findFirst.mockResolvedValueOnce({
      id,
      storeId: 'store',
      role: 'CASHIER',
    });
    expect((await adminRequest(request(), 'categories')).status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it('returns empty lists and scopes reads to the store', async () => {
    const response = await adminRequest(request(), 'categories');
    expect(await response.json()).toEqual([]);
    expect(mocks.db.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 'store' } }),
    );
  });
  it('creates categories and an audit entry in the same transaction', async () => {
    expect(
      (
        await adminRequest(
          request('POST', { name: 'Trà', sortOrder: 2 }),
          'categories',
        )
      ).status,
    ).toBe(201);
    expect(mocks.db.category.create).toHaveBeenCalledWith({
      data: { name: 'Trà', sortOrder: 2, storeId: 'store', isActive: true },
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: ownerId,
        entity: 'categories',
        action: 'CREATE',
        entityId: id,
      }),
    });
  });
  it('rejects empty or invalid payloads without mutations or audit', async () => {
    for (const body of [null, {}, { name: '', sortOrder: 0 }]) {
      expect(
        (await adminRequest(request('POST', body), 'categories')).status,
      ).toBe(400);
    }
    expect(mocks.db.category.create).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes and unknown resources', async () => {
    expect(
      (
        await adminRequest(
          request('POST', {}, 'https://foreign.example'),
          'categories',
        )
      ).status,
    ).toBe(403);
    expect((await adminRequest(request(), 'unknown')).status).toBe(404);
  });
  it('scopes writes to the store and returns 404 for missing records', async () => {
    mocks.db.category.findFirst.mockResolvedValue(null);
    expect(
      (
        await adminRequest(
          request('PUT', { id, name: 'Trà', sortOrder: 0 }),
          'categories',
        )
      ).status,
    ).toBe(404);
    expect(mocks.db.category.findFirst).toHaveBeenCalledWith({
      where: { id, storeId: 'store' },
    });
    expect(mocks.db.category.update).not.toHaveBeenCalled();
  });
  it('updates all three variants without replacing their identities', async () => {
    const body = {
      name: 'Latte',
      categoryId: id,
      sortOrder: 0,
      imageUrl: '',
      isAvailable: true,
      prices: { S: 20000, M: 25000, L: 30000 },
    };
    expect((await adminRequest(request('POST', body), 'products')).status).toBe(
      201,
    );
    expect(mocks.db.productVariant.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.db.productVariant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_name: { productId: id, name: 'M' } },
        update: { price: 25000, isActive: true },
      }),
    );
  });
  it('retires omitted sizes in both directions without deleting historical references', async () => {
    const base = {
      id,
      name: 'Món',
      categoryId: id,
      sortOrder: 0,
      imageUrl: '',
      isAvailable: true,
    };
    for (const prices of [{ Phần: 29000 }, { S: 20000, M: 25000, L: 30000 }]) {
      expect(
        (await adminRequest(request('PUT', { ...base, prices }), 'products'))
          .status,
      ).toBe(200);
      expect(mocks.db.productVariant.updateMany).toHaveBeenLastCalledWith({
        where: {
          storeId: 'store',
          productId: id,
          name: { notIn: Object.keys(prices) },
        },
        data: { isActive: false },
      });
    }
    expect(mocks.db.productVariant.deleteMany).not.toHaveBeenCalled();
  });
  it('toggles availability and audits it', async () => {
    expect(
      (
        await adminRequest(
          request('PATCH', { id, isAvailable: false }),
          'toppings',
        )
      ).status,
    ).toBe(200);
    expect(mocks.db.topping.update).toHaveBeenCalledWith({
      where: { id, storeId: 'store' },
      data: { isAvailable: false },
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ data: { isAvailable: false } }),
    });
  });
  it('prevents self-deactivation and self-deletion', async () => {
    expect(
      (
        await adminRequest(
          request('PUT', {
            id: ownerId,
            name: 'Owner',
            role: 'OWNER',
            email: 'owner@cafe.local',
            isActive: false,
            pin: '',
            password: '',
          }),
          'users',
        )
      ).status,
    ).toBe(400);
    expect(
      (await adminRequest(request('DELETE', { id: ownerId }), 'users')).status,
    ).toBe(400);
  });
  it('rejects new users without PIN or owner password', async () => {
    const user = {
      name: 'New',
      role: 'CASHIER',
      email: '',
      isActive: true,
      pin: '',
      password: '',
    };
    expect((await adminRequest(request('POST', user), 'users')).status).toBe(
      400,
    );
    expect(
      (
        await adminRequest(
          request('POST', {
            ...user,
            role: 'OWNER',
            email: 'new@cafe.local',
            pin: '1234',
          }),
          'users',
        )
      ).status,
    ).toBe(400);
  });
  it('never puts credential values in staff audit data', async () => {
    const user = {
      id,
      name: 'New',
      role: 'CASHIER',
      email: '',
      isActive: true,
      pin: '2222',
      password: 'password123',
    };
    expect((await adminRequest(request('PUT', user), 'users')).status).toBe(
      200,
    );
    const audit = JSON.stringify(mocks.db.auditLog.create.mock.calls);
    expect(audit).not.toContain('2222');
    expect(audit).not.toContain('password123');
    expect(audit).toContain('pinReset');
  });
  it('maps related-record constraints to actionable conflicts', async () => {
    mocks.db.category.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('foreign key', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );
    expect(
      (await adminRequest(request('DELETE', { id }), 'categories')).status,
    ).toBe(409);
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });
});
