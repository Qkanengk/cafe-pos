import type {
  MenuProduct,
  MenuTopping,
  BankDetails,
  SaleOrder,
} from './sales-types';
import type { z } from 'zod';
import type { checkoutSchema } from './sales-validation';
export type OfflineSnapshot = {
  user: { id: string; storeId: string; name: string; role: string };
  validUntil: number;
  products: MenuProduct[];
  toppings: MenuTopping[];
  categories: { id: string; name: string }[];
  tables: {
    id: string;
    name: string;
    area: string;
    orders: { id: string; code: string; total: number }[];
  }[];
  store: BankDetails & { name: string };
  shift: { id: string; openedAt: string } | null;
  catalogToken: string;
};
export type LocalDraft = {
  id: string;
  userId: string;
  input: z.infer<typeof checkoutSchema>;
  order: SaleOrder;
};
