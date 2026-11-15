-- C-14 resolved: merchantId is the merchant UUID everywhere (events, deliveries, merchants).
-- Existing rows hold the old integer ids, which never referred to a real merchant (no producer
-- emitted merchantId before this change), so they cannot be converted. Remove them; attempts and
-- replays cascade.
DELETE FROM "webhook_deliveries";

ALTER TABLE "webhook_deliveries" DROP COLUMN "merchant_id";
ALTER TABLE "webhook_deliveries" ADD COLUMN "merchant_id" UUID NOT NULL;

CREATE INDEX "webhook_deliveries_merchant_id_created_at_id_idx" ON "webhook_deliveries"("merchant_id", "created_at", "id");
CREATE UNIQUE INDEX "webhook_deliveries_event_id_merchant_id_key" ON "webhook_deliveries"("event_id", "merchant_id");
