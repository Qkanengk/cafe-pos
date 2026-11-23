import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiUser, apiError } from '@/lib/api';
import { payShare } from '@/lib/payment-parts';
import { paymentSchema } from '@/lib/sales-validation';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string }> },
) {
  try {
    const p = await params;
    return NextResponse.json(
      await payShare(
        await apiUser(request),
        z.uuid().parse(p.id),
        z.uuid().parse(p.partId),
        paymentSchema.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
