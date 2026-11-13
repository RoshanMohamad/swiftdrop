-- M09 Notifications & Realtime: consumer progress and masked delivery logs.

CREATE TABLE "processed_events" (
  "id"               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  "consumer"         VARCHAR(80)    NOT NULL,
  "event_id"         UUID           NOT NULL,
  "status"           VARCHAR(16)    NOT NULL,
  "attempts"         INTEGER        NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(3),
  "completed_at"     TIMESTAMPTZ(3),
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "processed_events_consumer_event_id_key"
    UNIQUE ("consumer", "event_id"),
  CONSTRAINT "processed_events_status_check"
    CHECK ("status" IN ('PROCESSING', 'DONE', 'FAILED'))
);

CREATE INDEX "processed_events_lease_expires_at_idx"
  ON "processed_events" ("lease_expires_at");

CREATE TABLE "notification_logs" (
  "id"               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"         UUID           NOT NULL,
  "channel"          VARCHAR(8)     NOT NULL,
  "template_id"      VARCHAR(80)    NOT NULL,
  "recipient_masked" VARCHAR(254)   NOT NULL,
  "status"           VARCHAR(8)     NOT NULL,
  "provider_msg_id"  VARCHAR(255),
  "sent_at"          TIMESTAMPTZ(3),
  "error_msg"        TEXT,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_logs_channel_check"
    CHECK ("channel" IN ('EMAIL', 'SMS')),
  CONSTRAINT "notification_logs_status_check"
    CHECK ("status" IN ('SENT', 'FAILED', 'SKIPPED'))
);

CREATE INDEX "notification_logs_event_id_channel_created_at_idx"
  ON "notification_logs" ("event_id", "channel", "created_at");
