import { z } from 'zod';
import { db } from './db';
import { HttpError } from './api';
import { reportRange } from './reports';
export function safeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeAuditData);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(password|pin(?:hash)?$|secret|token|credential|cookie|authorization)/i.test(
              key.replace(/[^a-z]/gi, ''),
            ),
        )
        .map(([key, item]) => [key, safeAuditData(item)]),
    );
  return value;
}
export async function loadAudit(
  actor: { storeId: string; role: string },
  filters: { from?: string; to?: string; action?: string; page?: string },
) {
  if (actor.role !== 'OWNER')
    throw new HttpError('Chỉ chủ quán được xem nhật ký', 403);
  const range = reportRange(
    filters.from || undefined,
    filters.to || filters.from || undefined,
  );
  const action = z
    .string()
    .trim()
    .max(50)
    .parse(filters.action ?? '');
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(filters.page ?? 1);
  const [rows, actions] = await Promise.all([
    db.auditLog.findMany({
      where: {
        storeId: actor.storeId,
        createdAt: { gte: range.start, lt: range.end },
        ...(action ? { action } : {}),
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 100,
      take: 101,
    }),
    db.auditLog.findMany({
      where: { storeId: actor.storeId },
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    }),
  ]);
  return {
    entries: rows
      .slice(0, 100)
      .map((row) => ({ ...row, data: safeAuditData(row.data) })),
    actions: actions.map((row) => row.action),
    from: range.from,
    to: range.to,
    action,
    page,
    hasMore: rows.length > 100,
  };
}
