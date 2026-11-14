import type { Channel, ConsumeMessage } from "amqplib";
import type { Logger } from "pino";
import { z } from "zod";
import {
  EXCHANGES,
  QUEUES,
  ROUTE,
  retryRoutingKey,
  type ConfirmedPublisher,
} from "@swiftdrop/messaging";
import type {
  Disposition,
  HandoffMessage,
  HandoffPublisher,
  WebhookProcessor,
} from "./processor.js";

export const ATTEMPT_HEADER = "x-swiftdrop-attempt";
export const RUN_HEADER = "x-swiftdrop-run";

const headerSchema = z.object({
  [ATTEMPT_HEADER]: z.number().int().min(0).max(6).default(0),
  [RUN_HEADER]: z.number().int().min(0).default(0),
});

const headers = (message: HandoffMessage) => ({
  [ATTEMPT_HEADER]: message.attempt,
  [RUN_HEADER]: message.run,
});

/** Confirmed publishes for retry and dead-letter hand-offs (never the topic exchange). */
export function createHandoffPublisher(
  publisher: ConfirmedPublisher,
): HandoffPublisher {
  return {
    retry: (message, delaySeconds) =>
      publisher.publish({
        exchange: EXCHANGES.webhookRetry,
        routingKey: retryRoutingKey(delaySeconds),
        content: message.content,
        messageId: message.messageId,
        headers: headers(message),
      }),
    deadLetter: (message) =>
      publisher.publish({
        exchange: EXCHANGES.dead,
        routingKey: ROUTE.deadWebhooks,
        content: message.content,
        messageId: message.messageId,
        headers: headers(message),
      }),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Consume webhooks.q. `ack` after durable completion, `reject` (no requeue) parks poison in
 * the DLQ through the queue's dead-letter policy, `requeue` waits briefly then redelivers
 * so a database or broker outage cannot cause a hot loop.
 */
export async function consumeWebhooks(
  channel: Channel,
  processor: WebhookProcessor,
  logger: Logger,
  options: { prefetch?: number; requeueDelayMs?: number } = {},
) {
  const inflight = new Set<Promise<void>>();
  await channel.prefetch(options.prefetch ?? 8);
  const { consumerTag } = await channel.consume(
    QUEUES.webhooks,
    (message: ConsumeMessage | null) => {
      if (!message) return;
      const work = (async () => {
        let disposition: Disposition;
        const parsed = headerSchema.safeParse(message.properties.headers ?? {});
        if (!parsed.success) {
          logger.warn({ event: "webhook_headers_invalid" });
          disposition = "reject";
        } else
          disposition = await processor.handle({
            content: message.content,
            attempt: parsed.data[ATTEMPT_HEADER],
            run: parsed.data[RUN_HEADER],
            redelivered: message.fields.redelivered,
          });
        try {
          if (disposition === "ack") channel.ack(message);
          else if (disposition === "reject")
            channel.nack(message, false, false);
          else {
            await sleep(options.requeueDelayMs ?? 2000);
            channel.nack(message, false, true);
          }
        } catch {
          /* channel closed: the broker redelivers the unacknowledged message */
        }
      })();
      inflight.add(work);
      void work.finally(() => inflight.delete(work));
    },
  );
  return {
    /** Stop taking messages and let in-flight ones finish (graceful shutdown, NFR-10). */
    async stop() {
      await channel.cancel(consumerTag).catch(() => undefined);
      await Promise.allSettled([...inflight]);
    },
  };
}
