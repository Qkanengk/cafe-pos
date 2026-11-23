import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiUser, apiError } from '@/lib/api';
import { db } from '@/lib/db';
import { orderInclude } from '@/lib/sales';
import { editOrderSchema, operationSchema } from '@/lib/sales-validation';
import { editOrder, operateOrder } from '@/lib/order-management';
import { clientIP } from '@/lib/pin-limit';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await apiUser(request);
    const id = z.uuid().parse((await params).id);
    const order = await db.order.findFirst({
      where: { id, storeId: user.storeId },
      include: orderInclude,
    });
    return order
      ? NextResponse.json(order)
      : NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 });
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const user = await apiUser(request);
    const id = z.uuid().parse((await params).id);
    return NextResponse.json(
      await editOrder(
        user,
        id,
        editOrderSchema.parse(await request.json().catch(() => null)),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await apiUser(request);
    const id = z.uuid().parse((await params).id);
    return NextResponse.json(
      await operateOrder(
        { ...user, ip: clientIP(request.headers) },
        id,
        operationSchema.parse(await request.json().catch(() => null)),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
