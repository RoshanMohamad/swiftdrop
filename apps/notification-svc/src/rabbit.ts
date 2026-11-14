import {
  connect,
  type Channel,
  type ChannelModel,
  type Options,
} from "amqplib";
import type { Logger } from "pino";
import type { EventConsumer } from "./types.js";

export type RabbitConnector = (
  url: string | Options.Connect,
) => Promise<ChannelModel>;

/**
 * RabbitMQ connectivity skeleton for the notification worker.
 *
 * It opens a connection/channel for readiness only. It intentionally does not
 * declare M08-owned topology, register a consumer, acknowledge, reject or
 * republish messages. Message consumption is a later integration increment.
 */
export class RabbitMqEventConsumerSkeleton implements EventConsumer {
  private connection?: ChannelModel;
  private channel?: Channel;
  private connecting?: Promise<boolean>;
  private stopped = false;
  private ready = false;

  constructor(
    private readonly url: string,
    private readonly logger: Pick<Logger, "info" | "warn">,
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
    this.channel = undefined;
    this.connection = undefined;
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
      });
      this.channel = await connection.createChannel();
      this.ready = true;
      this.logger.info("RabbitMQ readiness connection established");
      return true;
    } catch {
      this.ready = false;
      this.logger.warn(
        { error: "BROKER_UNAVAILABLE" },
        "RabbitMQ readiness check failed",
      );
      return false;
    }
  }
}
