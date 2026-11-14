import {
  connect,
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from "amqplib";
import { isSwiftDropEvent, type SwiftDropEvent } from "@swiftdrop/contracts";
import {
  EXCHANGES,
  QUEUES,
  buildTopology,
} from "@swiftdrop/messaging";
import type { Logger } from "pino";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_PREFETCH = 32;

/** Declare only M09's queue while consuming M08's shared topology definition. */
export async function declareRealtimeQueue(channel: Channel) {
  const topology = buildTopology();
  const exchange = topology.exchanges.find(
    (candidate) => candidate.name === EXCHANGES.events,
  );
  const queue = topology.queues.find(
    (candidate) => candidate.name === QUEUES.realtime,
  );
  if (!exchange || !queue)
    throw new Error("Shared messaging topology has no realtime queue.");
  await channel.assertExchange(exchange.name, exchange.type, { durable: true });
  await channel.assertQueue(queue.name, {
    durable: true,
    arguments: queue.arguments,
  });
  for (const binding of queue.bindings)
    await channel.bindQueue(queue.name, binding.exchange, binding.key);
}

export function decodeRealtimeMessage(message: ConsumeMessage) {
  let raw: unknown;
  try {
    raw = JSON.parse(message.content.toString("utf8"));
  } catch {
    return undefined;
  }
  if (
    !isSwiftDropEvent(raw) ||
    typeof message.properties.messageId !== "string" ||
    message.properties.messageId !== raw.eventId
  )
    return undefined;
  return raw;
}

/** Ack follows successful local handling; invalid events are safely discarded. */
export async function handleRealtimeMessage(input: {
  channel: Pick<Channel, "ack" | "nack">;
  message: ConsumeMessage;
  publish: (event: SwiftDropEvent) => Promise<unknown>;
  logger: Pick<Logger, "warn">;
}) {
  const event = decodeRealtimeMessage(input.message);
  if (!event) {
    input.logger.warn(
      { error: "INVALID_REALTIME_EVENT" },
      "Discarding invalid realtime event",
    );
    input.channel.nack(input.message, false, false);
    return "discarded" as const;
  }
  try {
    await input.publish(event);
    input.channel.ack(input.message);
    return "acknowledged" as const;
  } catch {
    input.logger.warn(
      { eventId: event.eventId, error: "REALTIME_HANDLING_FAILED" },
      "Realtime event handling failed",
    );
    input.channel.nack(input.message, false, true);
    return "requeued" as const;
  }
}

export function startRealtimeConsumer(input: {
  url: string;
  publish: (event: SwiftDropEvent) => Promise<unknown>;
  logger: Logger;
  state?: { connected: boolean };
  prefetch?: number;
}) {
  const prefetch = input.prefetch ?? DEFAULT_PREFETCH;
  if (!Number.isSafeInteger(prefetch) || prefetch < 1 || prefetch > 100)
    throw new Error("Realtime prefetch must be between 1 and 100.");
  let stopped = false;
  let connection: ChannelModel | undefined;
  let channel: Channel | undefined;
  const state = input.state ?? { connected: false };
  const task = (async () => {
    let delay = 1_000;
    while (!stopped) {
      try {
        connection = await connect(
          `${input.url}${input.url.includes("?") ? "&" : "?"}heartbeat=10`,
        );
        let open = true;
        connection.on("error", () => {
          open = false;
          state.connected = false;
        });
        connection.on("close", () => {
          open = false;
          state.connected = false;
        });
        const activeChannel = await connection.createChannel();
        channel = activeChannel;
        // realtime.q is durable, bound to parcel.# and has the shared 60 s TTL.
        await declareRealtimeQueue(activeChannel);
        await activeChannel.prefetch(prefetch);
        await activeChannel.consume(
          QUEUES.realtime,
          (message) => {
            if (!message) return;
            void handleRealtimeMessage({
              channel: activeChannel,
              message,
              publish: input.publish,
              logger: input.logger,
            }).catch(() => {
              // A channel/connection close can race an ack/nack. Reconnect will
              // redeliver any message that RabbitMQ did not observe as settled.
            });
          },
          { noAck: false },
        );
        state.connected = true;
        delay = 1_000;
        while (!stopped && open) await wait(500);
      } catch {
        state.connected = false;
        input.logger.warn(
          { error: "REALTIME_QUEUE_UNAVAILABLE" },
          "Realtime queue unavailable",
        );
        try {
          await channel?.close();
        } catch {
          // Already closed.
        }
        try {
          await connection?.close();
        } catch {
          // Already closed.
        }
        if (!stopped) {
          await wait(delay);
          delay = Math.min(delay * 2, 15_000);
        }
      }
    }
  })();
  return {
    state,
    async stop() {
      stopped = true;
      state.connected = false;
      try {
        await channel?.close();
      } catch {
        // Already closed.
      }
      try {
        await connection?.close();
      } catch {
        // Already closed.
      }
      await task;
    },
  };
}
