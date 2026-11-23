import { NextRequest, NextResponse } from 'next/server';
import { decodeJwt } from 'jose';
import { apiUser, apiError } from '@/lib/api';
import { COOKIE_NAME } from '@/lib/session';
import { db } from '@/lib/db';
import { signCatalog } from '@/lib/offline-catalog';
export async function GET(request: NextRequest) {
  try {
    const actor = await apiUser(request);
    const storeId = actor.storeId;
    const products = await db.product.findMany({
      where: { storeId },
      select: {
        id: true,
        categoryId: true,
        name: true,
        imageUrl: true,
        isAvailable: true,
        variants: {
          where: { isActive: true },
          select: { id: true, name: true, price: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const toppings = await db.topping.findMany({
      where: { storeId },
      select: { id: true, name: true, price: true, isAvailable: true },
      orderBy: { name: 'asc' },
    });
    const categories = await db.category.findMany({
      where: { storeId },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    });
    const tables = await db.table.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        area: true,
        orders: {
          where: { status: 'OPEN' },
          select: { id: true, code: true, total: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    const store = await db.store.findUniqueOrThrow({
      where: { id: storeId },
      select: {
        name: true,
        bankBin: true,
        bankAccount: true,
        bankAccountName: true,
      },
    });
    const shift = await db.shift.findFirst({
      where: { storeId, closedAt: null },
      select: { id: true, openedAt: true },
    });
    const validUntil =
      Number(decodeJwt(request.cookies.get(COOKIE_NAME)!.value).exp) * 1000;
    return NextResponse.json(
      {
        user: { id: actor.id, storeId, name: actor.name, role: actor.role },
        validUntil,
        products,
        toppings,
        categories,
        tables,
        store,
        shift,
        catalogToken: signCatalog({
          userId: actor.id,
          storeId,
          products,
          toppings,
        }),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
