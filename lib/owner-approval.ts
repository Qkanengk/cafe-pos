import { compare } from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { ownerPinLimiter, pinLockMessage } from './pin-limit';
import { HttpError } from './api';
export async function approveOwner(
  tx: Prisma.TransactionClient,
  actor: { storeId: string; ip?: string },
  pin: string,
) {
  const owners = await tx.user.findMany({
    where: { storeId: actor.storeId, role: 'OWNER', isActive: true },
    select: { id: true, pinHash: true },
  });
  const success = ownerPinLimiter.reserve(
    owners.map((owner) => owner.id),
    actor.ip,
  );
  if (!success) throw new HttpError(pinLockMessage, 429);
  for (const owner of owners)
    if (await compare(pin, owner.pinHash)) {
      success();
      return owner.id;
    }
  throw new HttpError('PIN chủ quán không đúng', 403);
}
