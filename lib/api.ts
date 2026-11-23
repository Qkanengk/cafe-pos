import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { COOKIE_NAME, verifySession } from './session';
import { validOrigin } from './request-origin';
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function apiUser(request: NextRequest) {
  if (request.method !== 'GET' && !validOrigin(request))
    throw new HttpError('Nguồn yêu cầu không hợp lệ', 403);
  const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) throw new HttpError('Chưa đăng nhập', 401);
  const user = await db.user.findFirst({
    where: { id: session.sub, storeId: session.storeId, isActive: true },
  });
  if (!user) throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
  return user;
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues.map((i) => i.message).join(' · ') },
      { status: 400 },
    );
  if (error instanceof RangeError)
    return NextResponse.json(
      { error: 'Số tiền không hợp lệ hoặc tiền khách đưa chưa đủ.' },
      { status: 400 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2003', 'P2025'].includes(error.code)
  )
    return NextResponse.json(
      { error: 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.' },
      { status: 409 },
    );
  console.error(
    'Sales request failed',
    error instanceof Error ? error.name : 'unknown',
  );
  return NextResponse.json(
    { error: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' },
    { status: 500 },
  );
}
