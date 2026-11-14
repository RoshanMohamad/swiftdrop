CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "consumer" VARCHAR(80) NOT NULL,
    "event_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "lease_expires_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "channel" VARCHAR(8) NOT NULL,
    "template_id" VARCHAR(80) NOT NULL,
    "recipient_masked" VARCHAR(254) NOT NULL,
    "status" VARCHAR(8) NOT NULL,
    "provider_msg_id" VARCHAR(255),
    "sent_at" TIMESTAMPTZ(3),
    "error_msg" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_events_consumer_event_id_key" ON "processed_events"("consumer", "event_id");
CREATE UNIQUE INDEX "notification_logs_event_id_channel_template_id_key" ON "notification_logs"("event_id", "channel", "template_id");
