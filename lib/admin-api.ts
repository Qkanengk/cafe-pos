import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { hash, compare } from 'bcryptjs';
import { db } from './db';
import { COOKIE_NAME, verifySession } from './session';
import { validOrigin } from './request-origin';
import { validateImageUrl, ImageError } from './images';
import {
  categorySchema,
  productSchema,
  toppingSchema,
  userSchema,
  settingsSchema,
  resourceSchema,
  recordIdSchema,
  availabilitySchema,
  safeUserSelect,
} from './admin-validation';

class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function adminRequest(request: NextRequest, resource: string) {
  try {
    const session = await verifySession(
      request.cookies.get(COOKIE_NAME)?.value,
    );
    if (!session) throw new AdminError('Chưa đăng nhập', 401);
    const actor = await db.user.findFirst({
      where: { id: session.sub, storeId: session.storeId, isActive: true },
    });
    if (!actor) throw new AdminError('Phiên đăng nhập không còn hiệu lực', 401);
    if (actor.role !== 'OWNER')
      throw new AdminError('Chỉ chủ quán có quyền truy cập', 403);
    if (!resourceSchema.safeParse(resource).success)
      throw new AdminError('Không tìm thấy', 404);
    if (resource === 'settings' && !['GET', 'PUT'].includes(request.method))
      throw new AdminError('Thao tác không hợp lệ', 405);
    if (request.method !== 'GET' && !validOrigin(request))
      throw new AdminError('Nguồn yêu cầu không hợp lệ', 403);
    const storeId = actor.storeId;
    if (request.method === 'GET') {
      const data =
        resource === 'categories'
          ? await db.category.findMany({
              where: { storeId },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            })
          : resource === 'products'
            ? await db.product.findMany({
                where: { storeId },
                include: {
                  variants: { where: { isActive: true } },
                  toppings: { select: { id: true } },
                },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              })
            : resource === 'toppings'
              ? await db.topping.findMany({
                  where: { storeId },
                  orderBy: { name: 'asc' },
                })
              : resource === 'users'
                ? await db.user.findMany({
                    where: { storeId },
                    select: safeUserSelect,
                    orderBy: { name: 'asc' },
                  })
                : await db.store.findUniqueOrThrow({ where: { id: storeId } });
      return NextResponse.json(data);
    }
    const body = await request.json().catch(() => null);
    if (resource === 'products' && ['POST', 'PUT'].includes(request.method))
      await validateImageUrl(productSchema.parse(body).imageUrl, storeId);
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
      const currentActor = await tx.user.findFirst({
        where: { id: actor.id, storeId, isActive: true, role: 'OWNER' },
      });
      if (!currentActor) throw new AdminError('Không có quyền truy cập', 403);
      const id =
        request.method === 'POST' && resource !== 'settings'
          ? undefined
          : recordIdSchema.parse(body).id;
      const model =
        resource === 'categories'
          ? tx.category
          : resource === 'products'
            ? tx.product
            : resource === 'toppings'
              ? tx.topping
              : resource === 'users'
                ? tx.user
                : tx.store;
      if (id) {
        const exists =
          resource === 'settings'
            ? await tx.store.findFirst({ where: { id, AND: { id: storeId } } })
            : await (model as typeof tx.category).findFirst({
                where: { id, storeId },
              });
        if (!exists) throw new AdminError('Không tìm thấy bản ghi', 404);
      }
      let data: unknown;
      let auditData: Prisma.InputJsonValue = {};
      if (request.method === 'DELETE') {
        if (resource === 'settings')
          throw new AdminError('Không thể xóa cửa hàng');
        if (resource === 'users' && id === actor.id)
          throw new AdminError('Không thể xóa tài khoản đang sử dụng');
        if (resource === 'products')
          await tx.productVariant.deleteMany({
            where: { productId: id, storeId },
          });
        data = await (model as typeof tx.category).delete({
          where: { id, storeId },
        });
      } else if (request.method === 'PATCH') {
        if (resource !== 'products' && resource !== 'toppings')
          throw new AdminError('Thao tác không hợp lệ');
        const update = availabilitySchema.parse(body);
        data =
          resource === 'products'
            ? await tx.product.update({
                where: { id, storeId },
                data: { isAvailable: update.isAvailable },
              })
            : await tx.topping.update({
                where: { id, storeId },
                data: { isAvailable: update.isAvailable },
              });
        auditData = { isAvailable: update.isAvailable };
      } else if (resource === 'categories') {
        const input = categorySchema.parse(body);
        auditData = input;
        data = id
          ? await tx.category.update({ where: { id, storeId }, data: input })
          : await tx.category.create({ data: { ...input, storeId } });
      } else if (resource === 'products') {
        const { prices, toppingIds, ...input } = productSchema.parse(body);
        const allowed = await tx.topping.findMany({
          where: { storeId, id: { in: toppingIds } },
          select: { id: true },
        });
        if (allowed.length !== new Set(toppingIds).size)
          throw new AdminError('Topping không thuộc cửa hàng này');
        if (
          !(await tx.category.findFirst({
            where: { id: input.categoryId, storeId },
          }))
        )
          throw new AdminError('Danh mục không tồn tại');
        const product = id
          ? await tx.product.update({
              where: { id, storeId },
              data: { ...input, toppings: { set: allowed } },
            })
          : await tx.product.create({
              data: { ...input, storeId, toppings: { connect: allowed } },
            });
        await tx.productVariant.updateMany({
          where: {
            storeId,
            productId: product.id,
            name: { notIn: Object.keys(prices) },
          },
          data: { isActive: false },
        });
        for (const [name, price] of Object.entries(prices))
          await tx.productVariant.upsert({
            where: { productId_name: { productId: product.id, name } },
            create: {
              storeId,
              productId: product.id,
              name,
              price,
            },
            update: { price, isActive: true },
          });
        data = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: {
            variants: { where: { isActive: true } },
            toppings: { select: { id: true } },
          },
        });
        auditData = { ...input, prices, toppingIds };
      } else if (resource === 'toppings') {
        const input = toppingSchema.parse(body);
        auditData = input;
        data = id
          ? await tx.topping.update({ where: { id, storeId }, data: input })
          : await tx.topping.create({ data: { ...input, storeId } });
      } else if (resource === 'users') {
        const { pin, password, email, ...input } = userSchema.parse(body);
        if (!id && !pin) throw new AdminError('Nhân viên mới cần mã PIN');
        if (id === actor.id && (!input.isActive || input.role !== 'OWNER'))
          throw new AdminError(
            'Không thể khóa hoặc hạ quyền tài khoản đang sử dụng',
          );
        const existing = id
          ? await tx.user.findUniqueOrThrow({ where: { id, storeId } })
          : null;
        if (input.isActive && existing && !existing.isActive && !pin)
          throw new AdminError(
            'Nhập lại PIN khi bật nhân viên để kiểm tra trùng mã.',
          );
        if (input.isActive && pin) {
          const active = await tx.user.findMany({
            where: {
              storeId,
              isActive: true,
              ...(id ? { id: { not: id } } : {}),
            },
            select: { pinHash: true },
          });
          for (const user of active)
            if (await compare(pin, user.pinHash))
              throw new AdminError(
                'PIN đã được nhân viên đang hoạt động trong quán sử dụng. Chọn PIN khác.',
                409,
              );
        }
        if (input.role === 'OWNER' && !password && !existing?.passwordHash)
          throw new AdminError('Chủ quán cần mật khẩu');
        const update = {
          ...input,
          email: email || null,
          ...(pin ? { pinHash: await hash(pin, 12) } : {}),
          ...(password ? { passwordHash: await hash(password, 12) } : {}),
        };
        data = id
          ? await tx.user.update({
              where: { id, storeId },
              data: update,
              select: safeUserSelect,
            })
          : await tx.user.create({
              data: { ...update, storeId, pinHash: update.pinHash! },
              select: safeUserSelect,
            });
        auditData = {
          ...input,
          email: email || null,
          pinReset: !!pin,
          passwordReset: !!password,
        };
      } else {
        const input = settingsSchema.parse(body);
        auditData = input;
        data = await tx.store.update({ where: { id: storeId }, data: input });
      }
      const entityId = (data as { id: string }).id;
      await tx.auditLog.create({
        data: {
          storeId,
          userId: actor.id,
          action:
            request.method === 'POST'
              ? 'CREATE'
              : request.method === 'DELETE'
                ? 'DELETE'
                : 'UPDATE',
          entity: resource,
          entityId,
          data: auditData,
        },
      });
      return resource === 'users' && request.method === 'DELETE'
        ? { id: entityId }
        : data;
    });
    return NextResponse.json(result, {
      status: request.method === 'POST' ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof ImageError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof AdminError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof Error && error.name === 'ZodError')
      return NextResponse.json(
        { error: 'Thông tin không hợp lệ. Vui lòng kiểm tra lại.' },
        { status: 400 },
      );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        return NextResponse.json(
          { error: 'Email đã được sử dụng.' },
          { status: 409 },
        );
      if (error.code === 'P2003')
        return NextResponse.json(
          {
            error:
              'Bản ghi đã có dữ liệu liên quan. Hãy tắt hoặc ngừng hoạt động thay vì xóa.',
          },
          { status: 409 },
        );
      if (error.code === 'P2025')
        return NextResponse.json(
          { error: 'Không tìm thấy bản ghi' },
          { status: 404 },
        );
    }
    console.error(
      'Admin operation failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      { error: 'Không thể lưu dữ liệu. Vui lòng thử lại.' },
      { status: 500 },
    );
  }
}
