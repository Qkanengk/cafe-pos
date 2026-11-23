import { z } from 'zod';
import { parseVndInput } from './money';
z.config(z.locales.vi());
const name = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập tên')
  .max(120, 'Tối đa 120 ký tự');
const money = z.preprocess(
  (value) => (typeof value === 'string' ? parseVndInput(value) : value),
  z.number().int().min(0).max(2147483647),
);
const sortOrder = z.number().int().min(0).max(9999);
const id = z.string().uuid();
export const banks = [
  ['970436', 'Vietcombank'],
  ['970418', 'BIDV'],
  ['970415', 'VietinBank'],
  ['970405', 'Agribank'],
  ['970422', 'MB Bank'],
  ['970407', 'Techcombank'],
  ['970416', 'ACB'],
  ['970432', 'VPBank'],
  ['970423', 'TPBank'],
  ['970403', 'Sacombank'],
  ['970443', 'SHB'],
  ['970441', 'VIB'],
  ['970437', 'HDBank'],
  ['970426', 'MSB'],
  ['970448', 'OCB'],
] as const;
export const categorySchema = z.object({
  name,
  sortOrder,
  isActive: z.boolean().default(true),
});
export const productSchema = z.object({
  name,
  categoryId: id,
  sortOrder,
  isAvailable: z.boolean(),
  toppingIds: z.array(id).max(100).default([]),
  imageUrl: z
    .union([
      z.literal(''),
      z.string().regex(/^\/api\/images\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/),
      z
        .url()
        .refine(
          (value) => /^https?:\/\//.test(value),
          'Chỉ hỗ trợ URL http/https',
        ),
    ])
    .default(''),
  prices: z.union([
    z.object({ S: money, M: money, L: money }),
    z.object({ Phần: money }),
  ]),
});
export const toppingSchema = z.object({
  name,
  price: money,
  isAvailable: z.boolean(),
});
export const userSchema = z
  .object({
    name,
    role: z.enum(['OWNER', 'CASHIER']),
    isActive: z.boolean(),
    email: z
      .union([z.literal(''), z.email()])
      .transform((v) => v.toLowerCase()),
    pin: z.union([
      z.literal(''),
      z.string().regex(/^[0-9]{4,6}$/, 'PIN gồm 4–6 chữ số'),
    ]),
    password: z.union([
      z.literal(''),
      z
        .string()
        .min(8, 'Mật khẩu tối thiểu 8 ký tự')
        .max(72, 'Mật khẩu tối đa 72 ký tự'),
    ]),
  })
  .refine((v) => v.role !== 'OWNER' || !!v.email, {
    message: 'Chủ quán cần email',
    path: ['email'],
  });
export const settingsSchema = z.object({
  name,
  address: z.string().trim().max(300),
  bankBin: z
    .string()
    .refine((v) => banks.some(([bin]) => bin === v), 'Vui lòng chọn ngân hàng'),
  bankAccount: z
    .string()
    .regex(/^[0-9]{1,19}$/, 'Số tài khoản gồm 1–19 chữ số'),
  bankAccountName: z.string().trim().min(1).max(100),
  receiptFooter: z.string().trim().max(500),
  receiptWidth: z.union([z.literal(58), z.literal(80)]),
});
export const resourceSchema = z.enum([
  'categories',
  'products',
  'toppings',
  'users',
  'settings',
]);
export type Resource = z.infer<typeof resourceSchema>;
export const adminSchemas = {
  categories: categorySchema,
  products: productSchema,
  toppings: toppingSchema,
  users: userSchema,
  settings: settingsSchema,
};
export const recordIdSchema = z.object({ id });
export const availabilitySchema = z.object({ id, isAvailable: z.boolean() });
export const safeUserSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  isActive: true,
} as const;
