import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError, HttpError } from '@/lib/api';
import { syncSchema } from '@/lib/sync-validation';
import { syncOrder } from '@/lib/sync';
export async function POST(request: NextRequest) {
  try {
    const actor = await apiUser(request);
    const raw = await request.text();
    if (raw.length > 2000000) throw new HttpError('Lô đồng bộ quá lớn', 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError('Dữ liệu JSON không hợp lệ');
    }
    const { entries } = syncSchema.parse(body);
    const results = [];
    for (const entry of entries) {
      try {
        results.push({ ...(await syncOrder(actor, entry)), ok: true });
      } catch (e) {
        const response = apiError(e);
        const { error } = await response.json();
        results.push({
          id: entry.order.id,
          ok: false,
          error,
          status: response.status,
        });
      }
    }
    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
