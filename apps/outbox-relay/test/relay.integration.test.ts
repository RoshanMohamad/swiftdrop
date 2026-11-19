import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
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
  QUEUES,
  createConfirmedPublisher,
  declareTopology,
} from "@swiftdrop/messaging";
import { publishBatch } from "../src/relay.js";

// Real PostgreSQL + RabbitMQ: proves the relay (FR-I1) publishes committed outbox rows to the
// topic exchange with confirms, and only then sets published_at.
const root = path.resolve(import.meta.dirname, "../../..");
const logger = pino({ enabled: false });
let postgres: StartedTestContainer;
let rabbit: StartedTestContainer;
let db: Database;
let connection: ChannelModel;
let channel: ConfirmChannel;

const CORRELATION = "corr-relay-it-1";
const envelope = (type = "parcel.created") => ({
  eventId: randomUUID(),
  type,
  version: 1,
  occurredAt: new Date().toISOString(),
  sequence: 1,
  data: { parcelId: randomUUID(), trackingNo: "SD-AAAAAAAA-1" },
});
const insertOutbox = (e: ReturnType<typeof envelope>, correlationId?: string) =>
  db.outboxEvent.create({
    data: {
      eventId: e.eventId,
      eventType: e.type,
      aggregateId: e.data.parcelId,
      payload: e,
      correlationId: correlationId ?? null,
    },
  });
const publishedAt = async (eventId: string) =>
  (await db.outboxEvent.findUniqueOrThrow({ where: { eventId } })).publishedAt;
const drain = async (queue: string) => {
  const messages = [];
  for (;;) {
    const message = await channel.get(queue, { noAck: true });
    if (!message) return messages;
    messages.push(message);
  }
};
/** Broker routing is asynchronous to the confirm, so wait until the queue shows the message. */
const until = async (check: () => Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for condition.");
};

beforeAll(async () => {
  postgres = await new GenericContainer(
    process.env.TEST_POSTGRES_IMAGE ?? "postgres:17-alpine",
  )
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "relay_test",
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
  const url = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/relay_test`;
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
  channel = await connection.createConfirmChannel();
  await declareTopology(channel);
}, 300_000);

afterAll(async () => {
  await connection?.close().catch(() => undefined);
  await db?.$disconnect();
  await rabbit?.stop();
  await postgres?.stop();
}, 120_000);

describe("outbox relay over real PostgreSQL and RabbitMQ (FR-I1)", () => {
  it("publishes a committed row to a bound queue and only then sets published_at", async () => {
    await drain(QUEUES.realtime);
    const event = envelope();
    await insertOutbox(event, CORRELATION);
    expect(await publishedAt(event.eventId)).toBeNull();

    const result = await publishBatch(
      db,
      createConfirmedPublisher(channel),
      logger,
    );
    expect(result).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(await publishedAt(event.eventId)).not.toBeNull();

    // parcel.# binds realtime.q: the broker really holds the message, with the contract intact.
    let received: Awaited<ReturnType<typeof drain>> = [];
    await until(async () => {
      received = [...received, ...(await drain(QUEUES.realtime))];
      return received.length >= 1;
    });
    expect(received).toHaveLength(1);
    const message = received[0]!;
    expect(message.fields.routingKey).toBe("parcel.created");
    expect(message.properties.messageId).toBe(event.eventId);
    expect(message.properties.headers).toMatchObject({
      "x-correlation-id": CORRELATION,
    });
    expect(JSON.parse(message.content.toString())).toEqual(event);
  });

  it("leaves published_at null when the broker cannot confirm, then publishes on the next poll", async () => {
    const event = envelope();
    await insertOutbox(event);

    // A closed channel is a broker outage from the relay's point of view.
    const dead = await connection.createConfirmChannel();
    const deadPublisher = createConfirmedPublisher(dead);
    await dead.close();
    const failed = await publishBatch(db, deadPublisher, logger);
    expect(failed).toMatchObject({ claimed: 1, published: 0, failed: 1 });
    expect(await publishedAt(event.eventId)).toBeNull();

    await drain(QUEUES.realtime);
    const retried = await publishBatch(
      db,
      createConfirmedPublisher(channel),
      logger,
    );
    expect(retried).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(await publishedAt(event.eventId)).not.toBeNull();
  });

  it("does not publish a row that is already marked published", async () => {
    const event = envelope();
    await insertOutbox(event);
    await publishBatch(db, createConfirmedPublisher(channel), logger);
    await drain(QUEUES.realtime);

    const again = await publishBatch(
      db,
      createConfirmedPublisher(channel),
      logger,
    );
    expect(again).toMatchObject({ claimed: 0, published: 0 });
    await new Promise((r) => setTimeout(r, 500));
    expect(await drain(QUEUES.realtime)).toHaveLength(0);
  });
});
