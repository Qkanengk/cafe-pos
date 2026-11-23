import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError, HttpError } from '@/lib/api';
import { db } from '@/lib/db';
import { openShiftSchema, closeShiftSchema } from '@/lib/sales-validation';
import {
  lockStore,
  listShifts,
  shiftInclude,
  summarizeShift,
} from '@/lib/sales';
export async function GET(request: NextRequest) {
  try {
    const user = await apiUser(request);
    return NextResponse.json(await listShifts(user.storeId));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const user = await apiUser(request);
    const input = openShiftSchema.parse(await request.json().catch(() => null));
    const result = await db.$transaction(async (tx) => {
      await lockStore(tx, user.storeId);
      if (
        !(await tx.user.findFirst({
          where: { id: user.id, storeId: user.storeId, isActive: true },
        }))
      )
        throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
      if (
        await tx.shift.findFirst({
          where: { storeId: user.storeId, closedAt: null },
        })
      )
        throw new HttpError('Quán đã có ca đang mở', 409);
      const shift = await tx.shift.create({
        data: {
          storeId: user.storeId,
          openedBy: user.id,
          openingCash: input.openingCash,
        },
        include: shiftInclude,
      });
      await tx.auditLog.create({
        data: {
          storeId: user.storeId,
          userId: user.id,
          action: 'OPEN',
          entity: 'shifts',
          entityId: shift.id,
          data: input,
        },
      });
      return summarizeShift(shift);
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: NextRequest) {
  try {
    const user = await apiUser(request);
    const input = closeShiftSchema.parse(
      await request.json().catch(() => null),
    );
    const result = await db.$transaction(async (tx) => {
      await lockStore(tx, user.storeId);
      if (
        !(await tx.user.findFirst({
          where: { id: user.id, storeId: user.storeId, isActive: true },
        }))
      )
        throw new HttpError('Phiên đăng nhập không còn hiệu lực', 401);
      const shift = await tx.shift.findFirst({
        where: { id: input.id, storeId: user.storeId },
        include: shiftInclude,
      });
      if (!shift) throw new HttpError('Không tìm thấy ca', 404);
      if (shift.closedAt) return summarizeShift(shift);
      if (shift.orders.some((o) => o.status === 'OPEN'))
        throw new HttpError(
          'Còn đơn chưa thanh toán. Vui lòng hoàn tất trước khi đóng ca.',
          409,
        );
      const updated = await tx.shift.update({
        where: { id: input.id },
        data: {
          countedCash: input.countedCash,
          note: input.note,
          closedAt: new Date(),
          closedBy: user.id,
        },
        include: shiftInclude,
      });
      const summary = summarizeShift(updated);
      await tx.auditLog.create({
        data: {
          storeId: user.storeId,
          userId: user.id,
          action: 'CLOSE',
          entity: 'shifts',
          entityId: shift.id,
          data: {
            expectedCash: summary.expectedCash,
            countedCash: input.countedCash,
            difference: summary.difference,
          },
        },
      });
      return summary;
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
