import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySession, ownerOnly } from './lib/session';
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === '/login' || path.startsWith('/api/auth/'))
    return NextResponse.next();
  const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (!session)
    return path.startsWith('/api/')
      ? NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
  if (ownerOnly(path) && session.role !== 'OWNER')
    return path.startsWith('/api/')
      ? NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
      : NextResponse.redirect(new URL('/pos', request.url));
  return NextResponse.next();
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
