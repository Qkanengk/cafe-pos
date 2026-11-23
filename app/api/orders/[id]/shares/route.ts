import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiUser, apiError } from '@/lib/api';
import { startShares, shareSchema } from '@/lib/payment-parts';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await startShares(
        await apiUser(request),
        z.uuid().parse((await params).id),
        shareSchema.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
