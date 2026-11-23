import { hash } from 'bcryptjs';
import { db } from '../lib/db';

async function main() {
  const passwordHash = await hash('owner123', 12);
  const ownerPin = await hash('1111', 12);
  const cashierPin = await hash('2222', 12);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(870011)`;
    if (await tx.store.count()) return;
    const store = await tx.store.create({
      data: {
        name: 'Cafe Demo',
        bankBin: '970436',
        bankAccount: '0123456789',
        bankAccountName: 'NGUYEN VAN A',
      },
    });
    const storeId = store.id;
    await tx.user.createMany({
      data: [
        {
          storeId,
          name: 'Chủ quán',
          role: 'OWNER',
          email: 'owner@cafe.local',
          passwordHash,
          pinHash: ownerPin,
        },
        { storeId, name: 'Lan', role: 'CASHIER', pinHash: cashierPin },
      ],
    });
    const menu = [
      ['Cà phê', 'Cà phê đen', 'Cà phê sữa', 'Bạc xỉu', 'Americano', 'Latte'],
      ['Trà', 'Trà đào', 'Trà vải', 'Trà chanh', 'Trà sen', 'Trà sữa'],
      [
        'Đá xay',
        'Matcha đá xay',
        'Chocolate đá xay',
        'Cà phê đá xay',
        'Dâu đá xay',
        'Xoài đá xay',
      ],
      [
        'Bánh',
        'Croissant',
        'Tiramisu',
        'Bánh phô mai',
        'Brownie',
        'Bánh chuối',
      ],
    ];
    for (const [sortOrder, [name, ...products]] of menu.entries()) {
      const category = await tx.category.create({
        data: { storeId, name, sortOrder },
      });
      for (const [index, name] of products.entries()) {
        const product = await tx.product.create({
          data: {
            storeId,
            categoryId: category.id,
            name,
            sortOrder: index,
          },
        });
        await tx.productVariant.createMany({
          data: [
            { storeId, productId: product.id, name: 'S', price: 25000 },
            { storeId, productId: product.id, name: 'M', price: 30000 },
            { storeId, productId: product.id, name: 'L', price: 35000 },
          ],
        });
      }
    }
    await tx.topping.createMany({
      data: [
        'Trân châu',
        'Thạch cà phê',
        'Kem cheese',
        'Pudding',
        'Shot espresso',
      ].map((name) => ({ storeId, name, price: 5000 })),
    });
    await tx.table.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        storeId,
        name: `Bàn ${i + 1}`,
        area: i < 4 ? 'Trong nhà' : 'Sân vườn',
      })),
    });
  });
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
