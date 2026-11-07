-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WebhookAttemptState" AS ENUM ('CLAIMED', 'DONE');

-- CreateEnum
CREATE TYPE "WebhookAttemptOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WebhookHandoff" AS ENUM ('NONE', 'RETRY', 'DLQ');

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "merchant_id" INTEGER NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "envelope" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "current_run" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_attempts" (
    "id" BIGSERIAL NOT NULL,
    "delivery_id" UUID NOT NULL,
    "run_number" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "state" "WebhookAttemptState" NOT NULL DEFAULT 'CLAIMED',
    "lease_until" TIMESTAMPTZ(3) NOT NULL,
    "outcome" "WebhookAttemptOutcome",
    "status_code" INTEGER,
    "latency_ms" INTEGER,
    "error_code" VARCHAR(64),
    "handoff" "WebhookHandoff" NOT NULL DEFAULT 'NONE',
    "next_retry_at" TIMESTAMPTZ(3),
    "handoff_confirmed_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_replays" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "run_number" INTEGER NOT NULL,
    "requested_by_user_id" INTEGER NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_replays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_created_at_id_idx" ON "webhook_deliveries"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_merchant_id_created_at_id_idx" ON "webhook_deliveries"("merchant_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_event_id_merchant_id_key" ON "webhook_deliveries"("event_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_attempts_delivery_id_run_number_attempt_key" ON "webhook_attempts"("delivery_id", "run_number", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_replays_delivery_id_run_number_key" ON "webhook_replays"("delivery_id", "run_number");

-- AddForeignKey
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "webhook_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_replays" ADD CONSTRAINT "webhook_replays_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "webhook_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
