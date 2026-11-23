import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
export const COOKIE_NAME = 'cafe_session';
export const sessionSchema = z.object({
  sub: z.string(),
  storeId: z.string(),
  name: z.string(),
  role: z.enum(['OWNER', 'CASHIER']),
});
export type Session = z.infer<typeof sessionSchema>;
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('AUTH_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
}
export async function signSession(session: Session) {
  return new SignJWT(sessionSchema.parse(session))
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .setIssuer('cafe-pos')
    .setAudience('cafe-pos')
    .sign(key());
}
export async function verifySession(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ['HS256'],
      issuer: 'cafe-pos',
      audience: 'cafe-pos',
    });
    return sessionSchema.parse(payload);
  } catch {
    return null;
  }
}
export function ownerOnly(path: string) {
  return (
    path.startsWith('/admin') ||
    path.startsWith('/reports') ||
    path.startsWith('/api/admin')
  );
}
