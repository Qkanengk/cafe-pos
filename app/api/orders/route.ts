import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError } from '@/lib/api';
import { checkoutSchema } from '@/lib/sales-validation';
import { prepareOrder, orderInclude } from '@/lib/sales';
import { db } from '@/lib/db';
import { orderHistoryWhere } from '@/lib/order-history';
export async function POST(request: NextRequest) {
  try {
    const actor = await apiUser(request);
    const input = checkoutSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await prepareOrder(actor, input));
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await apiUser(request);
    const shift = await db.shift.findFirst({
      where: { storeId: actor.storeId, closedAt: null },
    });
    return NextResponse.json(
      await db.order.findMany({
        where: orderHistoryWhere(actor.storeId, shift?.id, {
          shiftId: request.nextUrl.searchParams.get('shiftId') || undefined,
          date: request.nextUrl.searchParams.get('date') || undefined,
        }),
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
