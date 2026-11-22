-- Additive, nullable columns only: no backfill, existing rows keep NULL.
CREATE TYPE "HandlingNote" AS ENUM ('FRAGILE', 'KEEP_DRY', 'THIS_WAY_UP', 'HANDLE_WITH_CARE');

ALTER TABLE "parcels"
  ADD COLUMN "pickup_address" VARCHAR(300),
  ADD COLUMN "pickup_contact_name" VARCHAR(120),
  ADD COLUMN "pickup_contact_phone" VARCHAR(16),
  ADD COLUMN "item_description" VARCHAR(200),
  ADD COLUMN "handling_note" "HandlingNote",
  ADD COLUMN "declared_value_cents" INTEGER,
  ADD COLUMN "preferred_pickup_date" DATE;

ALTER TABLE "parcels"
  ADD CONSTRAINT "parcels_declared_value_cents_nonneg" CHECK ("declared_value_cents" IS NULL OR "declared_value_cents" >= 0);

ALTER TABLE "merchants"
  ADD COLUMN "default_pickup_address" VARCHAR(300),
  ADD COLUMN "default_pickup_contact_name" VARCHAR(120),
  ADD COLUMN "default_pickup_contact_phone" VARCHAR(16);
