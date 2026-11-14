import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import type { Logger } from "pino";
import type { Database } from "@swiftdrop/db";
import { isSwiftDropEvent, ROUTING_KEYS } from "@swiftdrop/contracts";
import type { ReceiptService } from "../receipts/service.js";

type WorkerState = { connected: boolean };
const EXCHANGE = "swiftdrop.events";
const QUEUE = "swiftdrop.event-log";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
class InvalidEvent extends Error {}

export function startParcelEventWorkers(
  db: Database,
  url: string,
  logger: Logger,
  state: WorkerState,
  receipts?: ReceiptService,
) {
  let stopped = false;
  let connection: ChannelModel | undefined;
  let consumer: ConfirmChannel | undefined;
  const run = async () => {
    let delay = 1000;
    while (!stopped) {
      try {
        const linked = await connect(
          `${url}${url.includes("?") ? "&" : "?"}heartbeat=10`,
        );
        connection = linked;
        let linkOpen = true;
        linked.on("error", () => {
          state.connected = false;
          linkOpen = false;
        });
        linked.on("close", () => {
          state.connected = false;
          linkOpen = false;
        });
        const consumerChannel = await linked.createConfirmChannel();
        consumer = consumerChannel;
        await consumerChannel.assertExchange(EXCHANGE, "topic", {
          durable: true,
        });
        await consumerChannel.assertQueue(QUEUE, { durable: true });
        await consumerChannel.bindQueue(
          QUEUE,
          EXCHANGE,
          ROUTING_KEYS.ALL_PARCEL,
        );
        await consumerChannel.prefetch(32);
        await consumerChannel.consume(QUEUE, (message) => {
          if (!message) return;
          void processMessage(message.content, message.properties.messageId)
            .then(() => {
              try {
                consumerChannel.ack(message);
              } catch {
                /* channel has closed */
              }
            })
            .catch((error: unknown) => {
              try {
                consumerChannel.nack(
                  message,
                  false,
                  !(error instanceof InvalidEvent),
                );
              } catch {
                /* channel has closed */
              }
            });
        });
        state.connected = true;
        delay = 1000;
        // Publication belongs to apps/outbox-relay (C-14); this process only consumes.
        while (!stopped && linkOpen) await wait(1000);
      } catch {
        state.connected = false;
        try {
          await consumer?.close();
        } catch {
          /* connection may already be closed */
        }
        try {
          await connection?.close();
        } catch {
          /* connection may already be closed */
        }
        consumer = undefined;
        connection = undefined;
        if (!stopped) {
          await wait(delay);
          delay = Math.min(delay * 2, 15000);
        }
      }
    }
  };
  const processMessage = async (body: Buffer, messageId?: string) => {
    let value: unknown;
    try {
      value = JSON.parse(body.toString("utf8"));
    } catch {
      throw new InvalidEvent("Invalid event JSON.");
    }
    if (!isSwiftDropEvent(value) || value.eventId !== messageId)
      throw new InvalidEvent("Invalid parcel event.");
    const event = value;
    if (
      event.type === ROUTING_KEYS.PARCEL_STATUS_CHANGED &&
      event.data.to === "DELIVERED"
    ) {
      if (!receipts) throw new Error("Receipt worker is not configured.");
      await receipts.generateForDelivered(event.data.parcelId);
    }
    const inserted = await db.consumerProgress.createMany({
      data: [{ eventId: event.eventId, eventType: event.type }],
      skipDuplicates: true,
    });
    if (inserted.count)
      logger.info(
        {
          eventId: event.eventId,
          eventType: event.type,
          parcelId: event.data.parcelId,
          sequence: event.sequence,
        },
        "Parcel event consumed",
      );
  };
  const task = run();
  return {
    state,
    async stop() {
      stopped = true;
      try {
        await consumer?.close();
      } catch {
        /* connection may already be closed */
      }
      try {
        await connection?.close();
      } catch {
        /* connection may already be closed */
      }
      await task;
    },
  };
}
