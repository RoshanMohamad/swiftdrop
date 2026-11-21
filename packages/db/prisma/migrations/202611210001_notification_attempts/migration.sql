-- Extend the canonical notification tables already introduced on main.
ALTER TABLE "processed_events" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "processed_events_lease_expires_at_idx" ON "processed_events" ("lease_expires_at");
CREATE INDEX "notification_logs_event_id_channel_created_at_idx" ON "notification_logs" ("event_id", "channel", "created_at");
