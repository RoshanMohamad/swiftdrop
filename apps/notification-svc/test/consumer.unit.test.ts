import { describe, expect, it, jest } from "@jest/globals";
import type { ParcelCreatedEvent } from "@swiftdrop/contracts";
import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";
import type { Logger } from "pino";
import {
  RabbitNotificationConsumer,
  type NotificationEventProcessor,
} from "../src/rabbit.js";
import { NotificationProcessingError } from "../src/service.js";

const created: ParcelCreatedEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  type: "parcel.created",
  version: 1,
  occurredAt: "2026-11-14T08:00:00.000Z",
  sequence: 1,
  data: {
    parcelId: "22222222-2222-4222-8222-222222222222",
    trackingNo: "SD1234567A",
    originZone: "Colombo",
    destZone: "Kandy",
    feeCents: 57000,
    scheduledDate: "2026-11-15",
  },
};

function message(
  body: unknown,
  messageId: string | undefined = created.eventId,
  attempt = 0,
) {
  return {
    content: Buffer.from(
      typeof body === "string" ? body : JSON.stringify(body),
    ),
    fields: {
      consumerTag: "notifications",
      deliveryTag: 1,
      redelivered: attempt > 0,
      exchange: "swiftdrop.events",
      routingKey: created.type,
    },
    properties: {
      contentType: "application/json",
      contentEncoding: undefined,
      headers: { "x-swiftdrop-notification-attempt": attempt },
      deliveryMode: 2,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId,
      timestamp: undefined,
      type: created.type,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  } as ConsumeMessage;
}

function harness(process: NotificationEventProcessor["process"]) {
  let delivery: ((message: ConsumeMessage | null) => void) | undefined;
  const order: string[] = [];
  const sent: Array<{
    queue: string;
    content: Buffer;
    options: Options.Publish;
  }> = [];
  const channel = {
    assertExchange: jest.fn(async () => ({ exchange: "swiftdrop.events" })),
    assertQueue: jest.fn(async (queue: string) => ({
      queue,
      messageCount: 0,
      consumerCount: 0,
    })),
    bindQueue: jest.fn(async () => ({})),
    prefetch: jest.fn(async () => ({})),
    consume: jest.fn(
      async (
        _queue: string,
        callback: (value: ConsumeMessage | null) => void,
      ) => {
        delivery = callback;
        return { consumerTag: "notifications" };
      },
    ),
    sendToQueue: jest.fn(
      (queue: string, content: Buffer, options: Options.Publish) => {
        order.push("send");
        sent.push({ queue, content, options });
        return true;
      },
    ),
    waitForConfirms: jest.fn(async () => {
      order.push("confirm");
    }),
    ack: jest.fn(() => order.push("ack")),
    nack: jest.fn(() => order.push("nack")),
    cancel: jest.fn(async () => ({ consumerTag: "notifications" })),
    close: jest.fn(async () => undefined),
  } as unknown as ConfirmChannel;
  const connection = {
    on: jest.fn(() => connection),
    createConfirmChannel: jest.fn(async () => channel),
    close: jest.fn(async () => undefined),
  } as unknown as ChannelModel;
  const connector = jest.fn(async () => connection);
  const processor = { process: jest.fn(process) };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Pick<Logger, "info" | "warn">;
  const consumer = new RabbitNotificationConsumer(
    "amqp://guest:guest@localhost:5672",
    processor,
    logger,
    4,
    connector,
  );

  return {
    channel,
    consumer,
    order,
    processor,
    sent,
    async deliver(value: ConsumeMessage) {
      await consumer.start();
      if (!delivery) throw new Error("Consumer callback was not registered.");
      delivery(value);
      await consumer.stop();
    },
  };
}

describe("RabbitNotificationConsumer", () => {
  it("validates and processes a booking event", async () => {
    const test = harness(async () => "completed");

    await test.deliver(message(created));

    expect(test.processor.process).toHaveBeenCalledWith(created);
    expect(test.channel.ack).toHaveBeenCalledTimes(1);
    expect(test.sent).toHaveLength(0);
  });

  it.each(["done", "busy"] as const)(
    "acknowledges the %s duplicate/lease outcome without retrying",
    async (result) => {
      const test = harness(async () => result);

      await test.deliver(message(created));

      expect(test.channel.ack).toHaveBeenCalledTimes(1);
      expect(test.sent).toHaveLength(0);
    },
  );

  it.each([
    ["malformed", message("{not-json")],
    [
      "messageId mismatch",
      message(created, "99999999-9999-4999-8999-999999999999"),
    ],
    ["unknown version", message({ ...created, version: 2 })],
  ])("parks %s only after confirmed DLQ handoff", async (_name, delivery) => {
    const test = harness(async () => "completed");

    await test.deliver(delivery as ConsumeMessage);

    expect(test.processor.process).not.toHaveBeenCalled();
    expect(test.sent).toHaveLength(1);
    expect(test.sent[0]?.queue).toBe("notifications.q.dlq");
    expect(test.sent[0]?.options.persistent).toBe(true);
    expect(test.order).toEqual(["send", "confirm", "ack"]);
  });

  it("retries SMTP failure directly to the notification queue", async () => {
    const test = harness(async () => {
      throw new NotificationProcessingError(1);
    });

    await test.deliver(message(created));

    expect(test.sent).toHaveLength(1);
    expect(test.sent[0]).toMatchObject({
      queue: "notifications.q",
      options: {
        persistent: true,
        messageId: created.eventId,
        headers: { "x-swiftdrop-notification-attempt": 1 },
      },
    });
    expect(test.order).toEqual(["send", "confirm", "ack"]);
  });

  it("parks an exhausted fourth attempt instead of publishing to the topic exchange", async () => {
    const test = harness(async () => {
      throw new NotificationProcessingError(4);
    });

    await test.deliver(message(created, created.eventId, 3));

    expect(test.sent).toHaveLength(1);
    expect(test.sent[0]).toMatchObject({
      queue: "notifications.q.dlq",
      options: {
        persistent: true,
        headers: {
          "x-swiftdrop-notification-attempt": 3,
          "x-swiftdrop-notification-failure": "DELIVERY_FAILED",
        },
      },
    });
    expect(test.order).toEqual(["send", "confirm", "ack"]);
  });

  it("parks a sanitized diagnostic when a payload contains contact data", async () => {
    const test = harness(async () => "completed");
    const rawEmail = "private@example.test";

    await test.deliver(message({ ...created, customerEmail: rawEmail }));

    expect(test.sent[0]?.queue).toBe("notifications.q.dlq");
    expect(test.sent[0]?.content.toString("utf8")).not.toContain(rawEmail);
    expect(JSON.stringify(test.sent[0]?.options)).not.toContain(rawEmail);
    expect(test.processor.process).not.toHaveBeenCalled();
  });
});
