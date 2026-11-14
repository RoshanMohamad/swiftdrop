import { once } from "node:events";
import {
  isSwiftDropEvent,
  QUEUES,
  ROUTING_KEYS,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Options,
} from "amqplib";
import type { Logger } from "pino";
import { NotificationProcessingError } from "./service.js";
import type { EventConsumer } from "./types.js";

const EXCHANGE = "swiftdrop.events";
// M08/M09 integration seam: M08 must review these declarations before merge.
const STATUS_BINDING = ROUTING_KEYS.PARCEL_STATUS_CHANGED.replace(
  /[^.]+$/,
  "*",
);
const DLQ = `${QUEUES.NOTIFICATIONS}.dlq`;
const ATTEMPT_HEADER = "x-swiftdrop-notification-attempt";
const FAILURE_HEADER = "x-swiftdrop-notification-failure";
const MAX_REDELIVERIES = 3;
const MAX_EVENT_BYTES = 64 * 1024;
const SENSITIVE_EVENT_KEYS = new Set([
  "address",
  "customeremail",
  "email",
  "phone",
  "recipientaddress",
  "recipientname",
  "recipientphone",
]);
const ENVELOPE_KEYS = new Set([
  "data",
  "eventId",
  "occurredAt",
  "sequence",
  "type",
  "version",
]);
const EVENT_DATA_KEYS = {
  "parcel.created": new Set([
    "customerId",
    "destZone",
    "feeCents",
    "merchantId",
    "originZone",
    "parcelId",
    "scheduledDate",
    "trackingNo",
  ]),
  "parcel.status.changed": new Set([
    "courierId",
    "from",
    "merchantId",
    "occurredAt",
    "parcelId",
    "to",
    "town",
    "trackingNo",
  ]),
  "parcel.assignment.changed": new Set([
    "newCourierId",
    "oldCourierId",
    "parcelId",
    "trackingNo",
  ]),
} satisfies Record<SwiftDropEvent["type"], ReadonlySet<string>>;

export type RabbitConnector = (
  url: string | Options.Connect,
) => Promise<ChannelModel>;

export interface NotificationEventProcessor {
  process(
    event: SwiftDropEvent,
  ): Promise<"ignored" | "acquired" | "done" | "busy" | "completed">;
}

function hasSensitiveEventData(value: unknown) {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length) {
    if (visited++ > 500) return true;
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (SENSITIVE_EVENT_KEYS.has(key.toLowerCase())) return true;
      pending.push(child);
    }
  }
  return false;
}

function hasOnlyContractFields(event: SwiftDropEvent) {
  return (
    Object.keys(event).every((key) => ENVELOPE_KEYS.has(key)) &&
    Object.keys(event.data).every((key) => EVENT_DATA_KEYS[event.type].has(key))
  );
}

function deliveryAttempt(message: ConsumeMessage) {
  const value = message.properties.headers?.[ATTEMPT_HEADER];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, MAX_REDELIVERIES)
    : 0;
}

export class RabbitNotificationConsumer implements EventConsumer {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private consumerTag?: string;
  private connecting?: Promise<boolean>;
  private stopped = false;
  private ready = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly url: string,
    private readonly processor: NotificationEventProcessor,
    private readonly logger: Pick<Logger, "info" | "warn">,
    private readonly prefetch = 4,
    private readonly connector: RabbitConnector = connect,
  ) {}

  async start() {
    this.stopped = false;
    await this.ensureConnected();
  }

  async checkReady() {
    if (this.stopped) return false;
    if (this.ready) return true;
    return this.ensureConnected();
  }

  async stop() {
    this.stopped = true;
    this.ready = false;
    if (this.channel && this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag);
      } catch {
        // The broker may already have cancelled the consumer.
      }
    }
    await Promise.allSettled([...this.inFlight]);
    await this.close();
  }

  private ensureConnected() {
    if (!this.connecting) {
      this.connecting = this.open().finally(() => {
        this.connecting = undefined;
      });
    }
    return this.connecting;
  }

  private async open() {
    if (this.stopped) return false;
    try {
      const connection = await this.connector(
        `${this.url}${this.url.includes("?") ? "&" : "?"}heartbeat=10`,
      );
      if (this.stopped) {
        await connection.close();
        return false;
      }
      this.connection = connection;
      connection.on("error", () => {
        this.ready = false;
      });
      connection.on("close", () => {
        this.ready = false;
        this.connection = undefined;
        this.channel = undefined;
        this.consumerTag = undefined;
      });

      const channel = await connection.createConfirmChannel();
      this.channel = channel;
      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(QUEUES.NOTIFICATIONS, { durable: true });
      await channel.assertQueue(DLQ, { durable: true });
      await channel.bindQueue(
        QUEUES.NOTIFICATIONS,
        EXCHANGE,
        ROUTING_KEYS.PARCEL_CREATED,
      );
      await channel.bindQueue(QUEUES.NOTIFICATIONS, EXCHANGE, STATUS_BINDING);
      await channel.prefetch(this.prefetch);
      const consumer = await channel.consume(
        QUEUES.NOTIFICATIONS,
        (message) => {
          if (message) this.schedule(channel, message);
        },
        { noAck: false },
      );
      this.consumerTag = consumer.consumerTag;
      this.ready = true;
      this.logger.info(
        { queue: QUEUES.NOTIFICATIONS, prefetch: this.prefetch },
        "Notification consumer ready",
      );
      return true;
    } catch {
      this.ready = false;
      this.logger.warn(
        { error: "BROKER_OR_TOPOLOGY_UNAVAILABLE" },
        "Notification consumer unavailable",
      );
      await this.close();
      return false;
    }
  }

  private schedule(channel: ConfirmChannel, message: ConsumeMessage) {
    const task = this.handle(channel, message).finally(() => {
      this.inFlight.delete(task);
    });
    this.inFlight.add(task);
  }

  private async handle(channel: ConfirmChannel, message: ConsumeMessage) {
    let parsed: unknown;
    if (message.content.byteLength > MAX_EVENT_BYTES) {
      await this.parkInvalid(channel, message, "EVENT_TOO_LARGE");
      return;
    }
    try {
      parsed = JSON.parse(message.content.toString("utf8"));
    } catch {
      await this.parkInvalid(channel, message, "MALFORMED_EVENT");
      return;
    }
    if (!isSwiftDropEvent(parsed)) {
      await this.parkInvalid(channel, message, "INVALID_OR_UNKNOWN_EVENT");
      return;
    }
    if (!hasOnlyContractFields(parsed)) {
      await this.parkInvalid(channel, message, "UNEXPECTED_EVENT_FIELDS");
      return;
    }
    if (hasSensitiveEventData(parsed)) {
      await this.parkInvalid(channel, message, "SENSITIVE_EVENT_DATA");
      return;
    }
    if (message.properties.messageId !== parsed.eventId) {
      await this.parkInvalid(channel, message, "MESSAGE_ID_MISMATCH");
      return;
    }

    try {
      const result = await this.processor.process(parsed);
      this.ack(channel, message);
      this.logger.info(
        { eventId: parsed.eventId, eventType: parsed.type, result },
        "Notification event handled",
      );
    } catch (error) {
      const failure =
        error instanceof NotificationProcessingError
          ? "DELIVERY_FAILED"
          : "PROCESSING_FAILED";
      await this.retryOrPark(channel, message, parsed, failure);
    }
  }

  private async retryOrPark(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    event: SwiftDropEvent,
    failure: "DELIVERY_FAILED" | "PROCESSING_FAILED",
  ) {
    const attempt = deliveryAttempt(message);
    try {
      if (attempt < MAX_REDELIVERIES) {
        await this.sendConfirmed(
          channel,
          QUEUES.NOTIFICATIONS,
          message.content,
          {
            contentType: "application/json",
            messageId: event.eventId,
            persistent: true,
            type: event.type,
            headers: { [ATTEMPT_HEADER]: attempt + 1 },
          },
        );
      } else {
        await this.sendConfirmed(channel, DLQ, message.content, {
          contentType: "application/json",
          messageId: event.eventId,
          persistent: true,
          type: event.type,
          headers: {
            [ATTEMPT_HEADER]: attempt,
            [FAILURE_HEADER]: failure,
          },
        });
      }
      this.ack(channel, message);
    } catch {
      this.nack(channel, message);
    }
  }

  private async parkInvalid(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    failure:
      | "EVENT_TOO_LARGE"
      | "MALFORMED_EVENT"
      | "SENSITIVE_EVENT_DATA"
      | "UNEXPECTED_EVENT_FIELDS"
      | "INVALID_OR_UNKNOWN_EVENT"
      | "MESSAGE_ID_MISMATCH",
  ) {
    try {
      const diagnostic = Buffer.from(
        JSON.stringify({ failure, occurredAt: new Date().toISOString() }),
      );
      await this.sendConfirmed(channel, DLQ, diagnostic, {
        contentType: "application/json",
        persistent: true,
        headers: { [FAILURE_HEADER]: failure },
      });
      this.ack(channel, message);
    } catch {
      this.nack(channel, message);
    }
  }

  private async sendConfirmed(
    channel: ConfirmChannel,
    queue: string,
    content: Buffer,
    options: Options.Publish,
  ) {
    if (!channel.sendToQueue(queue, content, options)) {
      await once(channel, "drain");
    }
    await channel.waitForConfirms();
  }

  private ack(channel: ConfirmChannel, message: ConsumeMessage) {
    try {
      channel.ack(message);
    } catch {
      // A closed channel will redeliver the unacknowledged message.
    }
  }

  private nack(channel: ConfirmChannel, message: ConsumeMessage) {
    try {
      channel.nack(message, false, true);
    } catch {
      // A closed channel will redeliver the unacknowledged message.
    }
  }

  private async close() {
    try {
      await this.channel?.close();
    } catch {
      // The broker may already have closed the channel.
    }
    try {
      await this.connection?.close();
    } catch {
      // The broker may already have closed the connection.
    }
    this.consumerTag = undefined;
    this.channel = undefined;
    this.connection = undefined;
  }
}
