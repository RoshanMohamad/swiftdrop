import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
} from "amqplib";
import {
  isSwiftDropEvent,
  QUEUES,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";
import type { Logger } from "pino";
import { NotificationProcessingError, NotificationService } from "./service.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DLQ = "notifications.dlq";

export class RabbitNotificationConsumer {
  readonly state = { connected: false };
  private stopped = false;
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(
    private readonly url: string,
    private readonly service: NotificationService,
    private readonly logger: Logger,
  ) {}

  start() {
    const task = this.run();
    return {
      state: this.state,
      stop: async () => {
        this.stopped = true;
        await this.close();
        await task;
      },
    };
  }

  private async run() {
    let delay = 1_000;
    while (!this.stopped) {
      try {
        const connection = await connect(
          `${this.url}${this.url.includes("?") ? "&" : "?"}heartbeat=10`,
        );
        this.connection = connection;
        let open = true;
        connection.on("error", () => {
          open = false;
          this.state.connected = false;
        });
        connection.on("close", () => {
          open = false;
          this.state.connected = false;
        });
        const channel = await connection.createConfirmChannel();
        this.channel = channel;
        // M08 owns declarations. M09 refuses readiness until that topology exists.
        await channel.checkQueue(QUEUES.NOTIFICATIONS);
        await channel.checkQueue(DLQ);
        await channel.prefetch(1);
        await channel.consume(QUEUES.NOTIFICATIONS, (message) => {
          if (message) void this.handle(channel, message);
        });
        this.state.connected = true;
        delay = 1_000;
        while (!this.stopped && open) await wait(500);
      } catch {
        this.state.connected = false;
        this.logger.warn(
          { error: "BROKER_UNAVAILABLE" },
          "Notification broker unavailable",
        );
        await this.close();
        if (!this.stopped) {
          await wait(delay);
          delay = Math.min(delay * 2, 15_000);
        }
      }
    }
  }

  private async handle(channel: ConfirmChannel, message: ConsumeMessage) {
    let event: SwiftDropEvent;
    try {
      const parsed: unknown = JSON.parse(message.content.toString("utf8"));
      if (
        !isSwiftDropEvent(parsed) ||
        parsed.eventId !== message.properties.messageId
      )
        throw new Error("INVALID_EVENT");
      event = parsed;
    } catch {
      await this.park(channel, message, "INVALID_EVENT");
      return;
    }
    try {
      const result = await this.service.process(event);
      if (result === "busy") channel.nack(message, false, true);
      else channel.ack(message);
    } catch (error) {
      if (!(error instanceof NotificationProcessingError)) {
        channel.nack(message, false, true);
        return;
      }
      if (error.attempts <= 3) {
        channel.nack(message, false, true);
        return;
      }
      await this.park(channel, message, "PROCESSING_FAILED");
    }
  }

  private async park(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    failure: "INVALID_EVENT" | "PROCESSING_FAILED",
  ) {
    try {
      channel.sendToQueue(DLQ, message.content, {
        persistent: true,
        contentType: "application/json",
        messageId: message.properties.messageId,
        headers: {
          ...message.properties.headers,
          "x-swiftdrop-failure": failure,
        },
      });
      await channel.waitForConfirms();
      channel.ack(message);
    } catch {
      channel.nack(message, false, true);
    }
  }

  private async close() {
    try {
      await this.channel?.close();
    } catch {
      // Connection may already be closed.
    }
    try {
      await this.connection?.close();
    } catch {
      // Connection may already be closed.
    }
    this.channel = undefined;
    this.connection = undefined;
  }
}
