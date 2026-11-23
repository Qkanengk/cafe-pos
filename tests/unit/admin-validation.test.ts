import { describe, expect, it } from 'vitest';
import {
  categorySchema,
  productSchema,
  toppingSchema,
  userSchema,
  settingsSchema,
} from '../../lib/admin-validation';
const categoryId = '7ff9e456-8548-4f88-9c18-1d2b655de2ce';
describe('shared admin validation', () => {
  it('names the invalid price and gives a clear Vietnamese correction', () => {
    for (const [value, message] of [
      ['', 'Giá size S'],
      [0, 'lớn hơn 0'],
      [-1, 'Giá size S'],
      [2147483648, '2.147.483.647'],
    ] as const) {
      const parsed = productSchema.safeParse({
        name: 'Coffee',
        categoryId,
        sortOrder: 0,
        isAvailable: true,
        prices: { S: value, M: 25000, L: 30000 },
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(
          parsed.error.issues.map((issue) => issue.message).join(' '),
        ).toContain(message);
    }
  });
  it('parses formatted VND prices without changing their magnitude', () => {
    const product = productSchema.parse({
      name: 'Latte',
      categoryId,
      sortOrder: 0,
      isAvailable: true,
      prices: { S: '20.000', M: '25,000', L: '30000' },
    });
    expect(product.prices).toEqual({ S: 20000, M: 25000, L: 30000 });
  });
  it('accepts a single Phần price and rejects missing or invalid portion prices', () => {
    const base = {
      name: 'Bánh',
      categoryId,
      sortOrder: 0,
      imageUrl: '',
      isAvailable: true,
    };
    expect(
      productSchema.parse({ ...base, prices: { Phần: 29000 } }).prices,
    ).toEqual({ Phần: 29000 });
    for (const prices of [{}, { Phần: -1 }, { Phần: 1.5 }])
      expect(productSchema.safeParse({ ...base, prices }).success).toBe(false);
  });
  it('accepts category names and integer display order', () => {
    expect(categorySchema.parse({ name: '  Cà phê  ', sortOrder: 1 })).toEqual({
      name: 'Cà phê',
      sortOrder: 1,
    });
    expect(categorySchema.safeParse({ name: ' ', sortOrder: 0 }).success).toBe(
      false,
    );
    expect(
      categorySchema.safeParse({ name: 'Trà', sortOrder: -1 }).success,
    ).toBe(false);
  });
  it('requires exactly priced S/M/L sizes with positive whole VND', () => {
    const product = {
      name: 'Latte',
      categoryId,
      imageUrl: '',
      sortOrder: 0,
      isAvailable: true,
      prices: { S: 20000, M: 30000, L: 35000 },
    };
    expect(productSchema.safeParse(product).success).toBe(true);
    for (const prices of [
      { S: 0, M: 2, L: 3 },
      { S: 1, M: 2 },
      { S: -1, M: 2, L: 3 },
      { S: 1.5, M: 2, L: 3 },
      { S: 2147483648, M: 2, L: 3 },
    ])
      expect(productSchema.safeParse({ ...product, prices }).success).toBe(
        false,
      );
    expect(
      productSchema.safeParse({ ...product, imageUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
    expect(
      productSchema.safeParse({
        ...product,
        imageUrl: 'https://images.example/coffee.jpg',
      }).success,
    ).toBe(true);
  });
  it('validates topping availability and price', () => {
    expect(
      toppingSchema.safeParse({ name: 'Kem', price: 5000, isAvailable: false })
        .success,
    ).toBe(true);
    expect(
      toppingSchema.safeParse({ name: '', price: 5000, isAvailable: true })
        .success,
    ).toBe(false);
    expect(
      toppingSchema.safeParse({ name: 'Kem', price: -1, isAvailable: true })
        .success,
    ).toBe(false);
  });
  it('validates staff roles, email, optional reset credentials and PINs', () => {
    const user = {
      name: 'Lan',
      role: 'CASHIER',
      isActive: true,
      email: '',
      pin: '2222',
      password: '',
    };
    expect(userSchema.safeParse(user).success).toBe(true);
    expect(
      userSchema.safeParse({ ...user, pin: '', password: '' }).success,
    ).toBe(true);
    for (const pin of ['12', 'abcdef', '1234567'])
      expect(userSchema.safeParse({ ...user, pin }).success).toBe(false);
    expect(userSchema.safeParse({ ...user, role: 'OWNER' }).success).toBe(
      false,
    );
    expect(
      userSchema.parse({
        ...user,
        role: 'OWNER',
        email: 'OWNER@CAFE.LOCAL',
        password: 'password123',
      }).email,
    ).toBe('owner@cafe.local');
    expect(userSchema.safeParse({ ...user, password: 'short' }).success).toBe(
      false,
    );
  });
  it('validates banks, account numbers and 58/80mm paper', () => {
    const settings = {
      name: 'Cafe',
      address: '',
      bankBin: '970436',
      bankAccount: '0123456789',
      bankAccountName: 'NGUYEN VAN A',
      receiptFooter: '',
      receiptWidth: 58,
    };
    expect(settingsSchema.safeParse(settings).success).toBe(true);
    expect(
      settingsSchema.safeParse({ ...settings, receiptWidth: 80 }).success,
    ).toBe(true);
    for (const invalid of [
      { name: '' },
      { bankBin: '123456' },
      { bankAccount: 'abc' },
      { receiptWidth: 60 },
    ])
      expect(
        settingsSchema.safeParse({ ...settings, ...invalid }).success,
      ).toBe(false);
  });
});
