ALTER TABLE "Order" ADD COLUMN "businessDate" TEXT NOT NULL DEFAULT '', ADD COLUMN "dailyNumber" INTEGER, ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "Order_storeId_businessDate_dailyNumber_key" ON "Order"("storeId", "businessDate", "dailyNumber");
CREATE UNIQUE INDEX "Order_storeId_code_key" ON "Order"("storeId", "code");
ALTER TABLE "Payment" ADD COLUMN "confirmedBy" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedBy_storeId_fkey" FOREIGN KEY ("confirmedBy", "storeId") REFERENCES "User"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
CREATE UNIQUE INDEX "Shift_one_open_per_store" ON "Shift"("storeId") WHERE "closedAt" IS NULL;
