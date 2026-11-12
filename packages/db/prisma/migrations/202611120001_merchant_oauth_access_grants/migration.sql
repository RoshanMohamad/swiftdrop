ALTER TABLE "access_grants"
  ALTER COLUMN "family_id" DROP NOT NULL,
  ADD COLUMN "client_id" UUID;

ALTER TABLE "access_grants"
  ADD CONSTRAINT "access_grants_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "merchant_api_clients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "access_grants"
  ADD CONSTRAINT "access_grants_exactly_one_principal"
  CHECK (num_nonnulls("family_id", "client_id") = 1);

CREATE INDEX "access_grants_client_id_idx" ON "access_grants"("client_id");
