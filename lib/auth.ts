import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
import { COOKIE_NAME, verifySession } from './session';
export async function requireUser(role?: 'OWNER' | 'CASHIER') {
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (!session) redirect('/login');
  const user = await db.user.findFirst({
    where: { id: session.sub, storeId: session.storeId },
  });
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect('/pos');
  return user;
}
