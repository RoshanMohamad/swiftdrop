-- NFR-13: the request's correlation id follows an event through the relay to every consumer.
-- Nullable: events written before this change, or outside an HTTP request, have none.
ALTER TABLE "outbox_events" ADD COLUMN "correlation_id" VARCHAR(64);
