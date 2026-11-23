import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiUser, apiError } from '@/lib/api';
import { refundOrder, refundSchema } from '@/lib/refunds';
import { clientIP } from '@/lib/pin-limit';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await apiUser(request);
    return NextResponse.json(
      await refundOrder(
        { ...actor, ip: clientIP(request.headers) },
        z.uuid().parse((await params).id),
        refundSchema.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
