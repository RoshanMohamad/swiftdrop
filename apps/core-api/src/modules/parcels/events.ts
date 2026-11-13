import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import type { Logger } from "pino";
import { Prisma, type Database } from "@swiftdrop/db";
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
  let relay: ConfirmChannel | undefined;
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
        const relayChannel = await linked.createConfirmChannel();
        const consumerChannel = await linked.createConfirmChannel();
        relay = relayChannel;
        consumer = consumerChannel;
        await relayChannel.assertExchange(EXCHANGE, "direct", {
          durable: true,
        });
        await consumerChannel.assertExchange(EXCHANGE, "direct", {
          durable: true,
        });
        await consumerChannel.assertQueue(QUEUE, { durable: true });
        await consumerChannel.bindQueue(QUEUE, EXCHANGE, "parcel.created");
        await consumerChannel.bindQueue(QUEUE, EXCHANGE, "parcel.delivered");
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
        while (!stopped && linkOpen) {
          await publishPending(db, relayChannel);
          await wait(1000);
        }
      } catch {
        state.connected = false;
        try {
          await relay?.close();
        } catch {
          /* connection may already be closed */
        }
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
        relay = undefined;
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
    const value: unknown = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object")
      throw new InvalidEvent("Invalid event.");
    const event = value as Record<string, unknown>;
    if (
      typeof event.eventId !== "string" ||
      event.eventId !== messageId ||
      (event.eventType !== "parcel.created" &&
        event.eventType !== "parcel.delivered") ||
      typeof event.parcelId !== "string" ||
      typeof event.town !== "string" ||
      typeof event.createdAt !== "string" ||
      (event.eventType === "parcel.created" && event.status !== "CREATED") ||
      (event.eventType === "parcel.delivered" && event.status !== "DELIVERED")
    )
      throw new InvalidEvent("Invalid parcel event.");
    if (event.eventType === "parcel.delivered") {
      if (!receipts) throw new Error("Receipt worker is not configured.");
      await receipts.generateForDelivered(event.parcelId);
    }
    const inserted = await db.consumerProgress.createMany({
      data: [{ eventId: event.eventId, eventType: event.eventType }],
      skipDuplicates: true,
    });
    if (inserted.count)
      logger.info(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          parcelId: event.parcelId,
          status: event.status,
          town: event.town,
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
        await relay?.close();
      } catch {
        /* connection may already be closed */
      }
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

async function publishPending(db: Database, channel: ConfirmChannel) {
  await db.$transaction(
    async (tx) => {
      const events = await tx.$queryRaw<
        Array<{
          id: string;
          event_id: string;
          event_type: string;
          payload: Prisma.JsonValue;
        }>
      >`
      SELECT id, event_id, event_type, payload FROM outbox_events
      WHERE published_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 50`;
      if (!events.length) return;
      for (const event of events)
        channel.publish(
          EXCHANGE,
          event.event_type,
          Buffer.from(JSON.stringify(event.payload)),
          {
            persistent: true,
            contentType: "application/json",
            messageId: event.event_id,
          },
        );
      await channel.waitForConfirms();
      const publishedAt = new Date();
      for (const event of events)
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt, attempts: { increment: 1 } },
        });
    },
    { timeout: 15000 },
  );
}
