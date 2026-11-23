import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError, HttpError } from '@/lib/api';
import { loadReport } from '@/lib/report-query';
export async function GET(request: NextRequest) {
  try {
    const user = await apiUser(request);
    if (user.role !== 'OWNER')
      throw new HttpError('Không có quyền truy cập', 403);
    const { searchParams } = request.nextUrl;
    try {
      return NextResponse.json(
        await loadReport(
          user.storeId,
          searchParams.get('from') ?? undefined,
          searchParams.get('to') ?? undefined,
        ),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      if (e instanceof RangeError) throw new HttpError(e.message);
      throw e;
    }
  } catch (e) {
    return apiError(e);
  }
}
