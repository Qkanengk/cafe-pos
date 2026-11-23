export type MenuVariant = { id: string; name: string; price: number };
export type MenuProduct = {
  id: string;
  categoryId: string;
  name: string;
  imageUrl: string | null;
  isAvailable: boolean;
  variants: MenuVariant[];
  toppings?: { id: string }[];
};
export type MenuTopping = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};
export type SaleOrder = {
  id: string;
  code: string;
  version: number;
  tableId: string | null;
  type: 'TAKEAWAY' | 'DINE_IN';
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  subtotal: number;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number;
  total: number;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  createdBy: string;
  creator: { name: string };
  table: { name: string; area: string } | null;
  items: {
    id: string;
    productId: string;
    variantId: string;
    nameSnapshot: string;
    priceSnapshot: number;
    quantity: number;
    note: string;
    status: 'ACTIVE' | 'VOIDED';
    voidReason?: string | null;
    toppings: {
      id: string;
      toppingId: string;
      nameSnapshot: string;
      priceSnapshot: number;
    }[];
  }[];
  payments: {
    id: string;
    method: 'CASH' | 'BANK_TRANSFER';
    amount: number;
    received: number | null;
    change: number | null;
    confirmedBy: string | null;
  }[];
  paymentParts?: {
    id: string;
    position: number;
    amount: number;
    payment: { id: string } | null;
  }[];
};
export type ShiftView = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  countedCash: number | null;
  note: string | null;
  opener: { name: string };
  closer: { name: string } | null;
  expectedCash: number;
  difference: number | null;
  cashSales: number;
  bankSales: number;
  paidCount: number;
  openCount: number;
};
export type BankDetails = {
  bankBin: string;
  bankAccount: string;
  bankAccountName: string;
};
