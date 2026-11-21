import { expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { createDatabase } from "@swiftdrop/db";
import type { ParcelCreatedEvent } from "@swiftdrop/contracts";
import { RabbitNotificationConsumer } from "../src/rabbit.js";
import { SmtpEmailSender } from "../src/senders.js";
import { NotificationService } from "../src/service.js";
import { PrismaNotificationProgress } from "../src/store.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://swiftdrop:local-development-only@127.0.0.1:5433/swiftdrop";
const rabbitManagementUrl =
  process.env.RABBITMQ_MANAGEMENT_URL ?? "http://127.0.0.1:15672";
const rabbitUrl =
  process.env.RABBITMQ_URL ?? "amqp://guest:guest@127.0.0.1:5672";
const smtpUrl = process.env.SMTP_URL ?? "smtp://127.0.0.1:1025";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
const basicAuth = `Basic ${Buffer.from("guest:guest").toString("base64")}`;

async function rabbitManagement(path: string, method: "PUT" | "DELETE") {
  const response = await fetch(`${rabbitManagementUrl}${path}`, {
    method,
    headers: { authorization: basicAuth },
  });
  if (!response.ok && response.status !== 204)
    throw new Error(`RabbitMQ management returned HTTP ${response.status}.`);
}

async function waitFor<T>(read: () => Promise<T | undefined>, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for notification integration state.");
}

async function mailpitMessages(trackingNumber: string) {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok)
    throw new Error(`Mailpit returned HTTP ${response.status}.`);
  const body = (await response.json()) as { messages?: unknown[] };
  return (body.messages ?? []).filter((message) =>
    JSON.stringify(message).includes(trackingNumber),
  );
}

it("delivers once through real RabbitMQ, PostgreSQL and Mailpit, then parks invalid input", async () => {
  const vhost = `m09-${randomUUID()}`;
  const eventId = randomUUID();
  const parcelId = randomUUID();
  const trackingNo = `SD${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const email = `m09-${eventId}@example.test`;
  const vhostPath = `/api/vhosts/${encodeURIComponent(vhost)}`;
  const isolatedRabbitUrl = `${rabbitUrl}/${encodeURIComponent(vhost)}`;
  const database = createDatabase(databaseUrl);
  let publisherConnection: ChannelModel | undefined;
  let publisher: ConfirmChannel | undefined;
  let consumer: RabbitNotificationConsumer | undefined;

  try {
    await rabbitManagement(vhostPath, "PUT");
    const service = new NotificationService(
      new PrismaNotificationProgress(database),
      {
        lookup: async () => ({
          eventId,
          parcelId,
          trackingNumber: trackingNo,
          customerEmail: email,
          recipientName: "Integration Recipient",
          recipientPhone: "+94771234567",
        }),
      },
      new SmtpEmailSender(smtpUrl, "no-reply@swiftdrop.test"),
      {
        send: async (message) => ({
          providerMessageId: `mock:${message.eventId}`,
        }),
      },
    );
    consumer = new RabbitNotificationConsumer(
      isolatedRabbitUrl,
      service,
      { info() {}, warn() {} },
      1,
    );
    await consumer.start();
    publisherConnection = await connect(isolatedRabbitUrl);
    publisher = await publisherConnection.createConfirmChannel();

    const event: ParcelCreatedEvent = {
      eventId,
      type: "parcel.created",
      version: 1,
      occurredAt: new Date().toISOString(),
      sequence: 1,
      data: {
        parcelId,
        trackingNo,
        originZone: "Colombo",
        destZone: "Kandy",
        feeCents: 57000,
        scheduledDate: "2026-11-15",
      },
    };
    const publish = (body: unknown, messageId = eventId) => {
      publisher?.publish(
        "swiftdrop.events",
        "parcel.created",
        Buffer.from(JSON.stringify(body)),
        { contentType: "application/json", messageId, persistent: true },
      );
    };

    publish(event);
    await publisher.waitForConfirms();
    await waitFor(async () => {
      const processed = await database.processedEvent.findUnique({
        where: { consumer_eventId: { consumer: "notification-svc", eventId } },
      });
      return processed?.status === "DONE" ? processed : undefined;
    });

    const logs = await database.notificationLog.findMany({
      where: { eventId },
      orderBy: { channel: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.status)).toEqual(["SENT", "SENT"]);
    expect(logs.every((log) => log.recipientMasked.includes("***"))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(email);
    await waitFor(async () =>
      (await mailpitMessages(trackingNo)).length === 1 ? true : undefined,
    );

    publish(event);
    await publisher.waitForConfirms();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await mailpitMessages(trackingNo)).toHaveLength(1);

    publish({ ...event, version: 2 });
    await publisher.waitForConfirms();
    const deadLetter = await waitFor(async () => {
      const message = await publisher?.get("notifications.dlq", {
        noAck: true,
      });
      return message || undefined;
    });
    expect(JSON.parse(deadLetter.content.toString("utf8"))).toMatchObject({
      failure: "INVALID_OR_UNKNOWN_EVENT",
    });
  } finally {
    await consumer?.stop().catch(() => undefined);
    await publisher?.close().catch(() => undefined);
    await publisherConnection?.close().catch(() => undefined);
    await database.notificationLog.deleteMany({ where: { eventId } });
    await database.processedEvent.deleteMany({ where: { eventId } });
    await database.$disconnect();
    await rabbitManagement(vhostPath, "DELETE").catch(() => undefined);
  }
}, 60_000);
