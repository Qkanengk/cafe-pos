import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { COOKIE_NAME, signSession } from '@/lib/session';
import { validOrigin } from '@/lib/request-origin';
const schema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('pin'),
    userId: z.string().min(1),
    pin: z.string().regex(/^\d{4,6}$/),
  }),
  z.object({
    mode: z.literal('password'),
    email: z.email(),
    password: z.string().min(1).max(200),
  }),
]);
export async function POST(request: NextRequest) {
  if (!validOrigin(request))
    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ' },
      { status: 403 },
    );
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: 'Thông tin đăng nhập không hợp lệ' },
      { status: 400 },
    );
  const data = body.data;
  const user = await db.user.findUnique({
    where:
      data.mode === 'pin'
        ? { id: data.userId }
        : { email: data.email.toLowerCase() },
  });
  const valid =
    user &&
    user.isActive &&
    (data.mode === 'pin'
      ? await compare(data.pin, user.pinHash)
      : user.role === 'OWNER' &&
        user.passwordHash &&
        (await compare(data.password, user.passwordHash)));
  if (!valid || !user)
    return NextResponse.json(
      { error: 'Tên đăng nhập hoặc mã bí mật không đúng' },
      { status: 401 },
    );
  const token = await signSession({
    sub: user.id,
    storeId: user.storeId,
    name: user.name,
    role: user.role,
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 43200,
  });
  return response;
}
