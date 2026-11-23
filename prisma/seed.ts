import { hash } from 'bcryptjs';
import { db } from '../lib/db';
import { seedMenu } from './menu';

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
    for (const [sortOrder, { name, products }] of seedMenu.entries()) {
      const category = await tx.category.create({
        data: { storeId, name, sortOrder },
      });
      for (const [index, entry] of products.entries()) {
        const product = await tx.product.create({
          data: {
            storeId,
            categoryId: category.id,
            name: entry.name,
            sortOrder: index,
          },
        });
        await tx.productVariant.createMany({
          data: entry.prices.map((price, index) => ({
            storeId,
            productId: product.id,
            name: entry.prices.length === 1 ? 'Phần' : ['S', 'M', 'L'][index],
            price,
          })),
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
