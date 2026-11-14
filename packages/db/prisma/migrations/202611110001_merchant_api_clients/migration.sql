CREATE TABLE "merchant_api_clients" (
  "id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "client_id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "secret_hash" CHAR(64) NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotated_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "merchant_api_clients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_api_clients_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "merchant_api_clients_scopes_check" CHECK (cardinality("scopes") BETWEEN 1 AND 2 AND "scopes" <@ ARRAY['orders:read', 'orders:write']::TEXT[])
);

CREATE UNIQUE INDEX "merchant_api_clients_client_id_key" ON "merchant_api_clients"("client_id");
CREATE INDEX "merchant_api_clients_merchant_id_created_at_id_idx" ON "merchant_api_clients"("merchant_id", "created_at", "id");
