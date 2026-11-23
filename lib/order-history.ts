import { z } from 'zod';
import { reportRange } from './reports';
export const historyFilters = z.object({
  shiftId: z.union([z.uuid(), z.literal('current')]).optional(),
  date: z.string().optional(),
});
export function orderHistoryWhere(
  storeId: string,
  currentShiftId: string | undefined,
  filters: { shiftId?: string; date?: string },
) {
  const parsed = historyFilters.parse(filters);
  if (parsed.date) {
    const range = reportRange(parsed.date);
    return { storeId, createdAt: { gte: range.start, lt: range.end } };
  }
  return {
    storeId,
    shiftId:
      parsed.shiftId && parsed.shiftId !== 'current'
        ? parsed.shiftId
        : (currentShiftId ?? 'none'),
  };
}
