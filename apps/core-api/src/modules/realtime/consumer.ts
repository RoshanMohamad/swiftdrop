import type { Logger } from "pino";
import { QUEUES, declareTopology, runWithBroker } from "@swiftdrop/messaging";

/**
 * Consume realtime.q and hand each message to the gateway. The queue has a short TTL and the
 * client re-syncs from an authorised snapshot, so a failed message is acknowledged rather than
 * redelivered. Replicas compete for messages; the Redis adapter fans each one out to every
 * socket on every replica.
 */
export function startRealtimeConsumer(options: {
  url: string;
  logger: Logger;
  handle: (content: Buffer) => Promise<void>;
}) {
  const abort = new AbortController();
  const task = runWithBroker({
    url: options.url,
    logger: options.logger,
    signal: abort.signal,
    session: async (connection, { closed, signal }) => {
      const channel = await connection.createChannel();
      channel.on("error", () => undefined);
      await declareTopology(channel);
      await channel.prefetch(32);
      const { consumerTag } = await channel.consume(
        QUEUES.realtime,
        (message) => {
          if (!message) return;
          void options
            .handle(message.content)
            .catch(() => options.logger.warn({ event: "realtime_emit_failed" }))
            .finally(() => {
              try {
                channel.ack(message);
              } catch {
                /* channel closed */
              }
            });
        },
      );
      await Promise.race([
        closed,
        new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        ),
      ]);
      await channel.cancel(consumerTag).catch(() => undefined);
    },
  });
  return {
    async stop() {
      abort.abort();
      await task;
    },
  };
}
