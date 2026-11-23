import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiUser, apiError } from '@/lib/api';
import { paymentSchema } from '@/lib/sales-validation';
import { payOrder } from '@/lib/sales';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await apiUser(request);
    const id = z.uuid().parse((await params).id);
    const input = paymentSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await payOrder(actor, id, input));
  } catch (error) {
    return apiError(error);
  }
}
