CREATE TABLE "parcel_receipts" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "object_key" VARCHAR(255) NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parcel_receipts_parcel_id_key" ON "parcel_receipts"("parcel_id");
CREATE UNIQUE INDEX "parcel_receipts_reference_key" ON "parcel_receipts"("reference");
CREATE UNIQUE INDEX "parcel_receipts_object_key_key" ON "parcel_receipts"("object_key");

ALTER TABLE "parcel_receipts"
ADD CONSTRAINT "parcel_receipts_parcel_id_fkey"
FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
