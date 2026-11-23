import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError } from '@/lib/api';
import { loadTables } from '@/lib/table-data';
export async function GET(request: NextRequest) {
  try {
    const user = await apiUser(request);
    return NextResponse.json(await loadTables(user.storeId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return apiError(error);
  }
}
