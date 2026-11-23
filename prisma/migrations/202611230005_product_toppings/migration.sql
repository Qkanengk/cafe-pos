CREATE TABLE "_ProductToppings" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, CONSTRAINT "_ProductToppings_AB_pkey" PRIMARY KEY ("A", "B"));
CREATE INDEX "_ProductToppings_B_index" ON "_ProductToppings"("B");
ALTER TABLE "_ProductToppings" ADD CONSTRAINT "_ProductToppings_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProductToppings" ADD CONSTRAINT "_ProductToppings_B_fkey" FOREIGN KEY ("B") REFERENCES "Topping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "_ProductToppings"("A", "B") SELECT p.id, t.id FROM "Product" p JOIN "Topping" t ON t."storeId" = p."storeId" WHERE EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND v."isActive" AND v.name <> 'Phần');
