import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import path from "node:path";
import pino from "pino";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import { createDatabase, type Database } from "@swiftdrop/db";
import {
  EXCHANGES,
  QUEUES,
  createConfirmedPublisher,
  declareTopology,
  type ConfirmedPublisher,
} from "@swiftdrop/messaging";
import { consumeWebhooks, createHandoffPublisher } from "../src/consumer.js";
import { WebhookProcessor } from "../src/processor.js";
import { HttpWebhookSender } from "../src/sender.js";
import { PrismaDeliveryStore } from "../src/store.js";
import { HEADERS, verify } from "../src/signing.js";

// Real broker + database: proves the retry queues dead-letter back to webhooks.q (and never
// through the topic exchange), confirmed hand-offs, durable attempts and the DLQ. Retry waits
// are shrunk to 400 ms through the topology test seam; production keeps 30..960 s.
const root = path.resolve(import.meta.dirname, "../../..");
const secret = "integration-secret-0123456789";
let postgres: StartedTestContainer;
let rabbit: StartedTestContainer;
let db: Database;
let connection: ChannelModel;
let setup: ConfirmChannel;
let publisher: ConfirmedPublisher;
let receiver: Server;
let hits: Array<{ headers: Record<string, unknown>; body: string }> = [];
let respond: (hit: number) => number = () => 200;
let consumer: { stop(): Promise<void> };
let targetUrl = "";

const until = async (check: () => Promise<boolean> | boolean, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for condition.");
};
const envelope = (merchantId: number | null = 7) => {
  const eventId = randomUUID();
  return {
    eventId,
    type: "parcel.created",
    version: 1,
    occurredAt: new Date().toISOString(),
    sequence: 1,
    data: { parcelId: randomUUID(), trackingNo: "SD-AAAAAAAA-1", merchantId },
  };
};
const publishEvent = (e: ReturnType<typeof envelope>) =>
  publisher.publish({
    exchange: EXCHANGES.events,
    routingKey: e.type,
    content: Buffer.from(JSON.stringify(e)),
    messageId: e.eventId,
  });
const delivery = (eventId: string) =>
  db.webhookDelivery.findFirst({ where: { eventId } });

beforeAll(async () => {
  postgres = await new GenericContainer(
    process.env.TEST_POSTGRES_IMAGE ?? "postgres:17-alpine",
  )
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "webhooks_test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  rabbit = await new GenericContainer("rabbitmq:4-management")
    .withExposedPorts(5672)
    .withWaitStrategy(Wait.forLogMessage("Server startup complete"))
    .start();
  const url = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/webhooks_test`;
  execFileSync(
    "pnpm",
    ["--filter", "@swiftdrop/db", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
      shell: true,
    },
  );
  db = createDatabase(url);
  connection = await connect(
    `amqp://guest:guest@${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`,
  );
  setup = await connection.createConfirmChannel();
  await declareTopology(setup, { retryDelayMs: () => 400 });
  publisher = createConfirmedPublisher(setup);

  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ headers: req.headers, body });
      res.statusCode = respond(hits.length);
      res.end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
  targetUrl = `http://localhost:${(receiver.address() as AddressInfo).port}/hook`;

  const consumeChannel = await connection.createChannel();
  const handoffChannel = await connection.createConfirmChannel();
  const processor = new WebhookProcessor({
    store: new PrismaDeliveryStore(db),
    config: { get: async () => ({ url: targetUrl, secret }) },
    sender: new HttpWebhookSender({
      devAllowedHosts: ["localhost"],
      timeoutMs: 2000,
    }),
    handoff: createHandoffPublisher(createConfirmedPublisher(handoffChannel)),
    logger: pino({ enabled: false }),
  });
  consumer = await consumeWebhooks(
    consumeChannel,
    processor,
    pino({ enabled: false }),
    {
      requeueDelayMs: 200,
    },
  );
}, 300_000);

afterAll(async () => {
  await consumer?.stop();
  await connection?.close().catch(() => undefined);
  receiver?.closeAllConnections();
  await new Promise((r) => receiver?.close(r));
  await db?.$disconnect();
  await rabbit?.stop();
  await postgres?.stop();
});

describe("webhook delivery over real RabbitMQ and PostgreSQL", () => {
  it("delivers a signed webhook for a merchant parcel event", async () => {
    hits = [];
    respond = () => 200;
    const event = envelope();
    await publishEvent(event);
    await until(
      async () => (await delivery(event.eventId))?.status === "SUCCESS",
    );
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(
      verify({
        secret,
        body: hit.body,
        timestamp: String(hit.headers[HEADERS.timestamp.toLowerCase()]),
        signature: String(hit.headers[HEADERS.signature.toLowerCase()]),
        now: new Date(),
      }),
    ).toBe(true);
    expect(JSON.parse(hit.body).eventId).toBe(event.eventId);
  });

  it("ignores customer parcels (no merchant)", async () => {
    hits = [];
    const event = envelope(null);
    await publishEvent(event);
    await new Promise((r) => setTimeout(r, 1500));
    expect(hits).toHaveLength(0);
    expect(await delivery(event.eventId)).toBeNull();
  });

  it("retries through the fixed-delay queue back into webhooks.q, then succeeds", async () => {
    hits = [];
    respond = (n) => (n < 3 ? 500 : 200);
    const event = envelope();
    await publishEvent(event);
    await until(
      async () => (await delivery(event.eventId))?.status === "SUCCESS",
    );
    expect(hits).toHaveLength(3);
    const attempts = await db.webhookAttempt.findMany({
      where: { delivery: { eventId: event.eventId } },
      orderBy: { attempt: "asc" },
    });
    expect(attempts.map((a) => [a.attempt, a.outcome, a.statusCode])).toEqual([
      [0, "FAILURE", 500],
      [1, "FAILURE", 500],
      [2, "SUCCESS", 200],
    ]);
    expect(attempts.slice(0, 2).every((a) => a.handoffConfirmedAt)).toBe(true);
    // Fresh timestamp/signature per attempt, same eventId.
    expect(new Set(hits.map((h) => JSON.parse(h.body).eventId))).toEqual(
      new Set([event.eventId]),
    );
  });

  it("makes seven attempts then parks the failure in webhooks.dlq, and an Admin-style replay re-delivers it", async () => {
    hits = [];
    respond = () => 500;
    const event = envelope();
    await publishEvent(event);
    await until(
      async () => (await delivery(event.eventId))?.status === "FAILED",
      60_000,
    );
    expect(hits).toHaveLength(7);
    expect(
      (
        await db.webhookAttempt.findMany({
          where: { delivery: { eventId: event.eventId } },
        })
      )
        .map((a) => a.attempt)
        .sort(),
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const check = await connection.createChannel();
    await until(
      async () =>
        (await check.checkQueue(QUEUES.webhooksDlq)).messageCount >= 1,
    );
    const dead = await check.get(QUEUES.webhooksDlq, { noAck: true });
    expect(dead && JSON.parse(dead.content.toString()).eventId).toBe(
      event.eventId,
    );
    await check.close();

    // Replay: what POST /admin/webhook-deliveries/:id/replay commits, then the relay publishes.
    const row = (await delivery(event.eventId))!;
    await db.webhookDelivery.update({
      where: { id: row.id },
      data: { currentRun: 1, status: "PENDING", completedAt: null },
    });
    hits = [];
    respond = () => 200;
    const replay = {
      eventId: randomUUID(),
      type: "webhook.replay.requested",
      version: 1,
      occurredAt: new Date().toISOString(),
      sequence: 1,
      data: { deliveryId: row.id, runNumber: 1 },
    };
    await publisher.publish({
      exchange: EXCHANGES.events,
      routingKey: replay.type,
      content: Buffer.from(JSON.stringify(replay)),
      messageId: replay.eventId,
    });
    await until(
      async () => (await delivery(event.eventId))?.status === "SUCCESS",
    );
    expect(hits).toHaveLength(1);
    expect(JSON.parse(hits[0]!.body).eventId).toBe(event.eventId);
  }, 120_000);

  it("never fans a replay request out to realtime or notification queues", async () => {
    const check = await connection.createChannel();
    const before = [
      (await check.checkQueue(QUEUES.realtime)).messageCount,
      (await check.checkQueue(QUEUES.notifications)).messageCount,
    ];
    await publisher.publish({
      exchange: EXCHANGES.events,
      routingKey: "webhook.replay.requested",
      content: Buffer.from(
        JSON.stringify({
          eventId: randomUUID(),
          type: "webhook.replay.requested",
          version: 1,
          occurredAt: new Date().toISOString(),
          sequence: 1,
          data: { deliveryId: randomUUID(), runNumber: 1 },
        }),
      ),
      messageId: randomUUID(),
    });
    await new Promise((r) => setTimeout(r, 500));
    expect([
      (await check.checkQueue(QUEUES.realtime)).messageCount,
      (await check.checkQueue(QUEUES.notifications)).messageCount,
    ]).toEqual(before);
    await check.close();
  });

  it("rejects publishing an event nothing is bound to (mandatory routing)", async () => {
    await expect(
      publisher.publish({
        exchange: EXCHANGES.events,
        routingKey: "unrouted.event",
        content: Buffer.from("{}"),
        messageId: randomUUID(),
      }),
    ).rejects.toThrow(/No queue accepted/);
  });
});
