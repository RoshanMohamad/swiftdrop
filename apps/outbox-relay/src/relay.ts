import type { Logger } from "pino";
import { Prisma, type Database } from "@swiftdrop/db";
import { eventEnvelopeSchema } from "@swiftdrop/contracts";
import { EXCHANGES, type ConfirmedMessage } from "@swiftdrop/messaging";

export const DEFAULT_BATCH_SIZE = 50;
/** `attempts` value that parks an unpublishable (malformed) row so it never blocks the queue. */
export const QUARANTINED = 1000;

export type Publisher = { publish(message: ConfirmedMessage): Promise<void> };
export type RelayDatabase = Pick<Database, "$transaction">;
export type BatchResult = {
  claimed: number;
  published: number;
  quarantined: number;
  failed: number;
};

type Row = {
  id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
};

/**
 * Claim committed outbox rows, publish them with confirms, and only then mark them published
 * (FR-I1). Safe with several relay replicas (`FOR UPDATE SKIP LOCKED`). A crash between the
 * broker confirm and the commit republishes the same eventId, which consumers deduplicate.
 */
export async function publishBatch(
  db: RelayDatabase,
  publisher: Publisher,
  logger: Logger,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<BatchResult> {
  return db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
        SELECT id, event_id, event_type, payload FROM outbox_events
        WHERE published_at IS NULL AND attempts < ${QUARANTINED}
        ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT ${batchSize}`);
      const result: BatchResult = {
        claimed: rows.length,
        published: 0,
        quarantined: 0,
        failed: 0,
      };
      if (!rows.length) return result;

      const sendable: Array<{ row: Row; message: ConfirmedMessage }> = [];
      const malformed: string[] = [];
      for (const row of rows) {
        const parsed = eventEnvelopeSchema.safeParse(row.payload);
        if (
          !parsed.success ||
          parsed.data.eventId !== row.event_id ||
          parsed.data.type !== row.event_type
        ) {
          // Log identifiers only: a malformed payload may contain data we must not echo.
          logger.error({
            event: "outbox_event_quarantined",
            eventId: row.event_id,
            eventType: row.event_type,
          });
          malformed.push(row.id);
          continue;
        }
        sendable.push({
          row,
          message: {
            exchange: EXCHANGES.events,
            routingKey: parsed.data.type,
            content: Buffer.from(JSON.stringify(parsed.data)),
            messageId: parsed.data.eventId,
            type: parsed.data.type,
          },
        });
      }

      // Pipeline the publishes, then keep the longest confirmed prefix so one failure never
      // lets a later event overtake an earlier one for the same parcel.
      const settled = await Promise.allSettled(
        sendable.map(({ message }) => publisher.publish(message)),
      );
      let prefix = 0;
      while (prefix < settled.length && settled[prefix]!.status === "fulfilled")
        prefix++;
      const failure = settled.find(
        (entry): entry is PromiseRejectedResult => entry.status === "rejected",
      );
      if (failure) {
        result.failed = sendable.length - prefix;
        logger.warn({
          event: "outbox_publish_failed",
          failed: result.failed,
          reason:
            failure.reason instanceof Error
              ? failure.reason.message
              : "unknown",
        });
      }
      if (prefix) {
        await tx.outboxEvent.updateMany({
          where: {
            id: { in: sendable.slice(0, prefix).map(({ row }) => row.id) },
          },
          data: { publishedAt: new Date(), attempts: { increment: 1 } },
        });
        result.published = prefix;
      }
      if (malformed.length) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: malformed } },
          data: { attempts: QUARANTINED },
        });
        result.quarantined = malformed.length;
      }
      return result;
    },
    { timeout: 30_000 },
  );
}
