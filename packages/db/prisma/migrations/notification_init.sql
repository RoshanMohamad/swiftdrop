-- Raw SQL reference for the notification module-owned Prisma schema (M09).
-- Source: packages/db/prisma/notification.prisma

-- Per-consumer event processing and duplicate-suppression tracker.
CREATE TABLE "processed_events" (
  "id"               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "consumer"         VARCHAR(80)  NOT NULL,
  "event_id"         UUID         NOT NULL,
  "status"           VARCHAR(16)  NOT NULL,
  "lease_expires_at" TIMESTAMPTZ(3),
  "completed_at"     TIMESTAMPTZ(3),
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "processed_events_consumer_event_id_key"
    UNIQUE ("consumer", "event_id")
);

-- Immutable audit log of notification delivery attempts.
CREATE TABLE "notification_logs" (
  "id"               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"         UUID          NOT NULL,
  "channel"          VARCHAR(8)    NOT NULL,
  "template_id"      VARCHAR(80)   NOT NULL,
  "recipient_masked" VARCHAR(254)  NOT NULL,
  "status"           VARCHAR(8)    NOT NULL,
  "provider_msg_id"  VARCHAR(255),
  "sent_at"          TIMESTAMPTZ(3),
  "error_msg"        TEXT,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
