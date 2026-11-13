import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import {
  isSwiftDropEvent,
  QUEUES,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";
import type { Logger } from "pino";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
class InvalidRealtimeEvent extends Error {}

export function startRealtimeConsumer(input: {
  url: string;
  publish: (event: SwiftDropEvent) => Promise<void>;
  logger: Logger;
  state?: { connected: boolean };
}) {
  let stopped = false;
  let connection: ChannelModel | undefined;
  let channel: ConfirmChannel | undefined;
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
        const activeChannel = await connection.createConfirmChannel();
        channel = activeChannel;
        await activeChannel.checkQueue(QUEUES.REALTIME);
        await activeChannel.prefetch(32);
        await activeChannel.consume(QUEUES.REALTIME, (message) => {
          if (!message) return;
          void (async () => {
            try {
              let value: unknown;
              try {
                value = JSON.parse(message.content.toString("utf8"));
              } catch {
                throw new InvalidRealtimeEvent();
              }
              if (
                !isSwiftDropEvent(value) ||
                value.eventId !== message.properties.messageId
              )
                throw new InvalidRealtimeEvent();
              await input.publish(value);
              activeChannel.ack(message);
            } catch (error) {
              try {
                activeChannel.nack(
                  message,
                  false,
                  !(error instanceof InvalidRealtimeEvent),
                );
              } catch {
                // The connection closed while this delivery was in flight.
              }
            }
          })();
        });
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
