import type { NextRequest } from 'next/server';
import { adminRequest } from '@/lib/admin-api';
type Context = { params: Promise<{ resource: string }> };
async function handle(request: NextRequest, context: Context) {
  return adminRequest(request, (await context.params).resource);
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
