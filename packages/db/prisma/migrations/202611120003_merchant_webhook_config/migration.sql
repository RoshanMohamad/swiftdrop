CREATE TABLE "merchant_webhook_configs" (
  "merchant_id" UUID NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "encrypted_secret" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "merchant_webhook_configs_pkey" PRIMARY KEY ("merchant_id"),
  CONSTRAINT "merchant_webhook_configs_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
