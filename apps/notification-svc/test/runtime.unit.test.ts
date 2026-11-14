import { describe, expect, it, jest } from "@jest/globals";
import type { Database } from "@swiftdrop/db";
import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";
import type { DestinationStream, Logger } from "pino";
import { createNotificationRuntime } from "../src/app.js";
import { parseNotificationConfig } from "../src/config.js";
import { createNotificationLogger } from "../src/logger.js";
import { RabbitNotificationConsumer } from "../src/rabbit.js";
import { MockSmsSender } from "../src/senders.js";
import type { EventConsumer } from "../src/types.js";

class FakeEventConsumer implements EventConsumer {
  starts = 0;
  stops = 0;

  constructor(public ready: boolean) {}

  async start() {
    this.starts += 1;
  }

  async checkReady() {
    return this.ready;
  }

  async stop() {
    this.stops += 1;
  }
}

function fakeDatabase(ready: boolean) {
  const state = { disconnects: 0 };
  const database = {
    $queryRaw: async () => {
      if (!ready) throw new Error("database unavailable");
      return [{ value: 1 }];
    },
    $disconnect: async () => {
      state.disconnects += 1;
    },
  } as unknown as Pick<Database, "$queryRaw" | "$disconnect">;
  return { database, state };
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as Pick<Logger, "info" | "warn">;

async function request(
  runtime: ReturnType<typeof createNotificationRuntime>,
  path: string,
) {
  const address = runtime.server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address.");
  return fetch(`http://127.0.0.1:${address.port}${path}`);
}

describe("notification runtime", () => {
  it("starts independently and reports PostgreSQL and RabbitMQ readiness", async () => {
    const { database, state } = fakeDatabase(true);
    const eventConsumer = new FakeEventConsumer(true);
    const runtime = createNotificationRuntime({
      database,
      eventConsumer,
      logger,
      host: "127.0.0.1",
      port: 0,
      readinessTimeoutMs: 500,
    });
    await runtime.start();
    try {
      const health = await request(runtime, "/healthz");
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ status: "ok" });

      const readiness = await request(runtime, "/readyz");
      expect(readiness.status).toBe(200);
      await expect(readiness.json()).resolves.toEqual({
        status: "ready",
        checks: { postgresql: true, rabbitmq: true },
      });
    } finally {
      await runtime.stop();
    }
    expect(eventConsumer.starts).toBe(1);
    expect(eventConsumer.stops).toBe(1);
    expect(state.disconnects).toBe(1);
  });

  it("stays healthy but not ready when dependencies are unavailable", async () => {
    const { database } = fakeDatabase(false);
    const runtime = createNotificationRuntime({
      database,
      eventConsumer: new FakeEventConsumer(false),
      logger,
      host: "127.0.0.1",
      port: 0,
      readinessTimeoutMs: 500,
    });
    await runtime.start();
    try {
      expect((await request(runtime, "/healthz")).status).toBe(200);
      const readiness = await request(runtime, "/readyz");
      expect(readiness.status).toBe(503);
      await expect(readiness.json()).resolves.toEqual({
        status: "not_ready",
        checks: { postgresql: false, rabbitmq: false },
      });
    } finally {
      await runtime.stop();
    }
  });
});

describe("configuration and redaction", () => {
  it("defaults local SMTP to Mailpit and rejects production guest RabbitMQ", () => {
    const development = parseNotificationConfig(
      { DATABASE_URL: "postgresql://user:pass@localhost:5432/swiftdrop" },
      "C:\\workspace",
    );
    expect(development.SMTP_URL).toBe("smtp://localhost:1025");

    expect(() =>
      parseNotificationConfig(
        {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://user:pass@localhost:5432/swiftdrop",
          SMTP_URL: "smtps://smtp.example.test",
        },
        "C:\\workspace",
      ),
    ).toThrow("dedicated RabbitMQ credential");
  });

  it("redacts structured contacts while preserving masked values", () => {
    const output: string[] = [];
    const destination = {
      write: (chunk: string) => output.push(chunk),
    } as DestinationStream;
    const redactedLogger = createNotificationLogger(
      { NOTIFICATION_LOG_LEVEL: "info" },
      destination,
    );
    redactedLogger.info(
      {
        phone: "+94771234567",
        recipient: "customer@example.test",
        recipientName: "Private Recipient",
        address: "Private Address",
        recipientMasked: "***4567",
      },
      "privacy test",
    );

    const serialized = output.join("");
    expect(serialized).not.toContain("+94771234567");
    expect(serialized).not.toContain("customer@example.test");
    expect(serialized).not.toContain("Private Recipient");
    expect(serialized).not.toContain("Private Address");
    expect(serialized).toContain("***4567");
    expect(JSON.parse(serialized)).toMatchObject({
      name: "notification-svc",
      phone: "[REDACTED]",
      recipient: "[REDACTED]",
      recipientName: "[REDACTED]",
      address: "[REDACTED]",
    });
  });
});

describe("adapters", () => {
  it("declares bounded durable notification topology", async () => {
    const consume = jest.fn(
      async (
        _queue: string,
        _callback: (message: ConsumeMessage | null) => void,
        _options?: Options.Consume,
      ) => ({ consumerTag: "notifications" }),
    );
    const closeChannel = jest.fn(async () => undefined);
    const channel = {
      assertExchange: jest.fn(async () => ({ exchange: "swiftdrop.events" })),
      assertQueue: jest.fn(async (queue: string) => ({
        queue,
        messageCount: 0,
        consumerCount: 0,
      })),
      bindQueue: jest.fn(async () => ({})),
      prefetch: jest.fn(async () => ({})),
      consume,
      cancel: jest.fn(async () => ({ consumerTag: "notifications" })),
      close: closeChannel,
    } as unknown as ConfirmChannel;
    const listeners = new Map<string, () => void>();
    const connection = {
      on: jest.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
        return connection;
      }),
      createConfirmChannel: jest.fn(async () => channel),
      close: jest.fn(async () => undefined),
    } as unknown as ChannelModel;
    const connector = jest.fn(async () => connection);
    const consumer = new RabbitNotificationConsumer(
      "amqp://guest:guest@localhost:5672",
      { process: jest.fn(async () => "completed" as const) },
      logger,
      4,
      connector,
    );

    await consumer.start();
    expect(await consumer.checkReady()).toBe(true);
    expect(channel.assertExchange).toHaveBeenCalledWith(
      "swiftdrop.events",
      "topic",
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith("notifications.q", {
      durable: true,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      "notifications.q",
      "swiftdrop.events",
      "parcel.created",
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      "notifications.q",
      "swiftdrop.events",
      "parcel.status.*",
    );
    expect(channel.prefetch).toHaveBeenCalledWith(4);
    expect(consume).toHaveBeenCalledWith(
      "notifications.q",
      expect.any(Function),
      { noAck: false },
    );
    await consumer.stop();
    expect(closeChannel).toHaveBeenCalledTimes(1);
  });

  it("logs only a masked phone through the mock SMS adapter", async () => {
    const entries: unknown[] = [];
    const sms = new MockSmsSender({
      info: (entry: unknown) => void entries.push(entry),
    } as Pick<Logger, "info">);

    await sms.send({
      eventId: "11111111-1111-4111-8111-111111111111",
      recipient: "+94771234567",
      body: "test",
    });

    expect(entries).toEqual([
      expect.objectContaining({ recipientMasked: "***4567" }),
    ]);
    expect(JSON.stringify(entries)).not.toContain("+94771234567");
  });
});
