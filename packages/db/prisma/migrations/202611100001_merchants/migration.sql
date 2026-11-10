CREATE TYPE "MerchantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "merchants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" INTEGER NOT NULL,
  "business_name" VARCHAR(160) NOT NULL,
  "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING',
  "reviewed_at" TIMESTAMPTZ(3),
  "reviewed_by_id" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "merchants_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "merchants_review_state" CHECK (("status" = 'PENDING' AND "reviewed_at" IS NULL) OR ("status" <> 'PENDING' AND "reviewed_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "merchants_user_id_key" ON "merchants"("user_id");
CREATE INDEX "merchants_status_created_at_id_idx" ON "merchants"("status", "created_at", "id");
