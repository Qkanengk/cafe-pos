import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError } from '@/lib/api';
export async function GET(request: NextRequest) {
  try {
    await apiUser(request);
    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
