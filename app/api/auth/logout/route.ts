import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';
import { requestOrigin, validOrigin } from '@/lib/request-origin';
export async function POST(request: NextRequest) {
  if (!validOrigin(request))
    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ' },
      { status: 403 },
    );
  const response = NextResponse.redirect(
    new URL('/login', requestOrigin(request)),
    303,
  );
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
