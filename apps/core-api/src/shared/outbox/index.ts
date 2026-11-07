import { randomUUID } from "node:crypto";
import {
  EVENT_ENVELOPE_VERSION,
  eventEnvelopeSchema,
  type EventEnvelope,
} from "@swiftdrop/contracts";
import type { Prisma } from "@swiftdrop/db";

export type OutboxTransaction = Pick<Prisma.TransactionClient, "outboxEvent">;

export type OutboxEventInput = {
  /** Also the AMQP routing key, e.g. `parcel.created` or `parcel.status.changed`. */
  type: string;
  /** Primary key of the entity the event is about (parcel id, webhook delivery id). */
  aggregateId: string;
  /** Strictly increasing per aggregate; the first event is 1. */
  sequence: number;
  occurredAt?: Date;
  /** Ids, statuses and towns only. Contact data, photos and free text are rejected. */
  data: Record<string, unknown>;
};

/**
 * Transactional outbox writer (plan X-09). Call it with the Prisma transaction client that
 * also writes the business change, so the event exists if and only if the change committed.
 * The relay (apps/outbox-relay) publishes it after commit. `eventId` equals the outbox
 * primary key and stays the same through every retry and replay.
 */
export async function addOutboxEvent(
  tx: OutboxTransaction,
  input: OutboxEventInput,
): Promise<EventEnvelope> {
  const eventId = randomUUID();
  // Validating here, in the producer's transaction, means a malformed event rolls back the
  // business change instead of becoming an unpublishable row later.
  const envelope = eventEnvelopeSchema.parse({
    eventId,
    type: input.type,
    version: EVENT_ENVELOPE_VERSION,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    sequence: input.sequence,
    data: input.data,
  });
  await tx.outboxEvent.create({
    data: {
      id: eventId,
      eventId,
      eventType: envelope.type,
      aggregateId: input.aggregateId,
      payload: envelope as Prisma.InputJsonObject,
    },
  });
  return envelope;
}

export const outbox = { add: addOutboxEvent };
