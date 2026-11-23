import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError } from '@/lib/api';
import { checkoutSchema } from '@/lib/sales-validation';
import { prepareOrder, orderInclude } from '@/lib/sales';
import { db } from '@/lib/db';
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
        where: { storeId: actor.storeId, shiftId: shift?.id ?? 'none' },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
