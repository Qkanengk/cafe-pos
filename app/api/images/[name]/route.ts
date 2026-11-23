import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError } from '@/lib/api';
import { loadImage, ImageError } from '@/lib/images';
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const user = await apiUser(request),
      { name } = await params;
    const image = await loadImage(user.storeId, name);
    return new Response(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mime,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof ImageError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return apiError(error);
  }
}
