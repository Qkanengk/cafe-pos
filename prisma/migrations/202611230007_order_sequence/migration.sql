CREATE TABLE "OrderSequence" (
  "storeId" TEXT NOT NULL,
  "businessDate" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  CONSTRAINT "OrderSequence_pkey" PRIMARY KEY ("storeId", "businessDate"),
  CONSTRAINT "OrderSequence_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

WITH allocations AS (
  SELECT "storeId", "businessDate", "dailyNumber" AS number FROM "Order"
  WHERE "businessDate" <> '' AND "dailyNumber" IS NOT NULL
  UNION ALL
  SELECT "storeId",
    regexp_replace(data->>'previousCode', '^CF([0-9]{4})([0-9]{2})([0-9]{2})-[0-9]+$', '\1-\2-\3'),
    split_part(data->>'previousCode', '-', 2)::INTEGER
  FROM "AuditLog" WHERE data->>'previousCode' ~ '^CF[0-9]{8}-[0-9]{4,9}$'
)
INSERT INTO "OrderSequence" ("storeId", "businessDate", "lastNumber")
SELECT "storeId", "businessDate", MAX(number) FROM allocations GROUP BY "storeId", "businessDate";
