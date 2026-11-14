ALTER TABLE "parcels"
ADD COLUMN "merchant_id" UUID;

ALTER TABLE "parcels"
ADD CONSTRAINT "parcels_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "parcels_merchant_id_created_at_id_idx"
ON "parcels"("merchant_id", "created_at", "id");
