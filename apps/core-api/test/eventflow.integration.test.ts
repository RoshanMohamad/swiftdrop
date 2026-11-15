import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
} from "amqplib";
import pino from "pino";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import { createDatabase, type Database } from "@swiftdrop/db";
import {
  QUEUES,
  createConfirmedPublisher,
  declareTopology,
} from "@swiftdrop/messaging";
import { correlationIdFromHeaders } from "@swiftdrop/contracts";
import { LifecycleService } from "../src/modules/lifecycle/index.js";
import { correlationMiddleware } from "../src/shared/correlation.js";
import { publishBatch } from "../../outbox-relay/src/relay.js";
import {
  consumeWebhooks,
  createHandoffPublisher,
} from "../../webhook-svc/src/consumer.js";
import { WebhookProcessor } from "../../webhook-svc/src/processor.js";
import { PrismaDeliveryStore } from "../../webhook-svc/src/store.js";
import { HttpWebhookSender } from "../../webhook-svc/src/sender.js";
import { HEADERS, verify } from "../../webhook-svc/src/signing.js";
import { NotificationProcessor } from "../../notification-svc/src/processor.js";
import { PrismaProgressStore } from "../../notification-svc/src/store.js";
import { createChannelSender } from "../../notification-svc/src/senders.js";
import type { ContactLookup } from "../../notification-svc/src/lookup.js";
import type { Message } from "../../notification-svc/src/templates.js";

/**
 * Design Doc §11 "Event flow": one status update must produce exactly one notification and one
 * signed webhook, even when the broker delivers the event twice. Everything between the status
 * change and the two side effects is real: LifecycleService, the transactional outbox, the
 * relay's publishBatch, RabbitMQ with the production topology, the webhook consumer/processor
 * and the notification processor. Only the outermost edges are recorded: a local HTTP receiver
 * stands in for the merchant, and the email/SMS senders are recorders. The merchant's webhook
 * URL comes from a stub config source (the HTTP source has its own tests).
 */
const root = resolve(import.meta.dirname, "../../..");
// The config's testTimeout is not applied per project, so state it: cold PDF/broker work is slow.
jest.setTimeout(60_000);
const SECRET = "flow-test-signing-secret-0123456789";
const CORRELATION = "flow-test-0001";
const logger = pino({ enabled: false });

let postgres: StartedTestContainer;
let rabbit: StartedTestContainer;
let db: Database;
let connection: ChannelModel;
let publishChannel: ConfirmChannel;
let publisher: ReturnType<typeof createConfirmedPublisher>;
let notifyChannel: Channel;
let webhookConsumer: { stop(): Promise<void> };
let receiver: Server;
let targetUrl: string;
let lifecycle: LifecycleService;

const hits: Array<{ headers: Record<string, unknown>; body: string }> = [];
const emails: Message[] = [];
const sms: Message[] = [];
const seenCorrelation: Array<string | undefined> = [];
const lookup: ContactLookup = {
  fetch: async () => ({
    trackingNumber: "SD-FLOW0001-X",
    customerEmail: "customer@example.test",
    recipientName: "Recipient Person",
    recipientPhone: "+94771234567",
  }),
};

const migrate = (url: string) =>
  execFileSync(
    process.execPath,
    [
      resolve(root, "packages/db/node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
    ],
    {
      cwd: resolve(root, "packages/db"),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    },
  );

const until = async (check: () => boolean | Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for the event flow.");
};
const settle = (ms = 2000) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  [postgres, rabbit] = await Promise.all([
    new GenericContainer("postgres:17-alpine")
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "flow_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections", 2),
      )
      .start(),
    new GenericContainer("rabbitmq:4-management")
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage("Server startup complete"))
      .start(),
  ]);
  const url = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/flow_test`;
  migrate(url);
  db = createDatabase(url);
  for (const role of ["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"] as const)
    await db.role.upsert({ where: { id: role }, update: {}, create: { id: role } });
  lifecycle = new LifecycleService(db);

  connection = await connect(
    `amqp://guest:guest@${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`,
  );
  publishChannel = await connection.createConfirmChannel();
  await declareTopology(publishChannel, { retryDelayMs: () => 400 });
  publisher = createConfirmedPublisher(publishChannel);

  // The merchant's endpoint.
  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      hits.push({ headers: req.headers, body });
      res.statusCode = 200;
      res.end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
  targetUrl = `http://localhost:${(receiver.address() as AddressInfo).port}/hook`;

  // webhook-svc: production consumer and processor, stub config source.
  const webhookConsume = await connection.createChannel();
  const handoff = await connection.createConfirmChannel();
  webhookConsumer = await consumeWebhooks(
    webhookConsume,
    new WebhookProcessor({
      store: new PrismaDeliveryStore(db),
      config: { get: async () => ({ url: targetUrl, secret: SECRET }) },
      sender: new HttpWebhookSender({
        devAllowedHosts: ["localhost"],
        timeoutMs: 2000,
      }),
      handoff: createHandoffPublisher(createConfirmedPublisher(handoff)),
      logger,
    }),
    logger,
    { requeueDelayMs: 200 },
  );

  // notification-svc: production processor, recording senders, same ack rules as its server.
  const notifications = new NotificationProcessor({
    store: new PrismaProgressStore(db),
    lookup,
    sender: createChannelSender({
      EMAIL: { send: async (m) => (emails.push(m), { providerMessageId: "e" }) },
      SMS: { send: async (m) => (sms.push(m), { providerMessageId: "s" }) },
    }),
    appOrigin: "http://localhost:5173",
    logger,
  });
  notifyChannel = await connection.createChannel();
  await notifyChannel.consume(QUEUES.notifications, async (message) => {
    if (!message) return;
    const correlationId = correlationIdFromHeaders(message.properties.headers);
    seenCorrelation.push(correlationId);
    const disposition = await notifications.handle(message.content, correlationId);
    if (disposition === "ack") notifyChannel.ack(message);
    else notifyChannel.nack(message, false, disposition === "requeue");
  });
}, 300_000);

afterAll(async () => {
  await webhookConsumer?.stop();
  await connection?.close().catch(() => undefined);
  receiver?.closeAllConnections();
  await new Promise((r) => receiver?.close(r));
  await db?.$disconnect();
  await Promise.allSettled([rabbit?.stop(), postgres?.stop()]);
}, 90_000);

let counter = 0;
let merchantId: string;
let customerId: number;
let originId: number;
let destinationId: number;
let priceVersionId: number;

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "webhook_deliveries","processed_events","notification_logs","outbox_events","parcel_history","parcels","quotes","price_versions","zones","merchants","users" RESTART IDENTITY CASCADE',
  );
  hits.length = emails.length = sms.length = seenCorrelation.length = 0;
  const user = (email: string, roleId: "CUSTOMER" | "MERCHANT") =>
    db.user.create({
      data: { email, fullName: "Test User", phone: "+94771234567", roleId },
    });
  customerId = (await user("customer@example.test", "CUSTOMER")).id;
  const owner = await user("merchant@example.test", "MERCHANT");
  merchantId = (
    await db.merchant.create({
      data: {
        userId: owner.id,
        businessName: "Flow Test Shop",
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    })
  ).id;
  const origin = await db.zone.create({ data: { district: "Colombo", town: "Colombo" } });
  const destination = await db.zone.create({ data: { district: "Kandy", town: "Kandy" } });
  originId = origin.id;
  destinationId = destination.id;
  priceVersionId = (
    await db.priceVersion.create({
      data: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        baseCents: 45000,
        perExtraKgCents: 12000,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      },
    })
  ).id;
});

async function newParcel(forMerchant: boolean) {
  const serial = ++counter;
  const quote = await db.quote.create({
    data: {
      userId: customerId,
      originZoneId: originId,
      destinationZoneId: destinationId,
      priceVersionId,
      weightGrams: 2000,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
      feeCents: 57000,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  return db.parcel.create({
    data: {
      trackingNumber: `SD-F${String(serial).padStart(7, "0")}-X`,
      userId: customerId,
      ...(forMerchant ? { merchantId } : {}),
      quoteId: quote.id,
      originZoneId: originId,
      destinationZoneId: destinationId,
      feeCents: 57000,
      recipientName: "Recipient Person",
      recipientPhone: "+94771234567",
      recipientAddress: "1 Test Road",
      history: { create: { status: "CREATED", town: "Colombo" } },
    },
  });
}

/** One PICKED_UP status change, made inside a request carrying a known correlation id. */
async function pickUp(parcelId: string, version: number) {
  await new Promise<void>((resolveRequest, reject) => {
    correlationMiddleware()(
      { headers: { "x-correlation-id": CORRELATION } } as unknown as Request,
      { locals: {}, setHeader: () => undefined } as unknown as Response,
      (() => {
        lifecycle
          .transition(parcelId, "PICKED_UP", "Colombo", version)
          .then(() => resolveRequest(), reject);
      }) as never,
    );
  });
}
const relay = () => publishBatch(db, publisher, logger);

describe("one status update, exactly one notification and one signed webhook (§11)", () => {
  it("fans a merchant parcel's status change out once to each consumer", async () => {
    const parcel = await newParcel(true);
    await pickUp(parcel.id, parcel.version);

    const outbox = await db.outboxEvent.findFirstOrThrow({
      where: { eventType: "parcel.status.changed" },
    });
    expect(outbox.correlationId).toBe(CORRELATION);
    expect(outbox.publishedAt).toBeNull();

    expect(await relay()).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    await until(() => hits.length >= 1 && emails.length >= 1);
    await settle();

    // Exactly one notification (PICKED_UP is email only) ...
    expect(emails).toHaveLength(1);
    expect(sms).toHaveLength(0);
    expect(emails[0]!.to).toBe("customer@example.test");
    expect(await db.$queryRaw`SELECT 1 FROM notification_logs`).toHaveLength(1);

    // ... and exactly one webhook, signed, carrying the original eventId.
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    const body = JSON.parse(hit.body) as { eventId: string; type: string };
    expect(body).toMatchObject({
      eventId: outbox.eventId,
      type: "parcel.status.changed",
    });
    expect(
      verify({
        secret: SECRET,
        body: hit.body,
        timestamp: String(hit.headers[HEADERS.timestamp.toLowerCase()]),
        signature: String(hit.headers[HEADERS.signature.toLowerCase()]),
        now: new Date(),
      }),
    ).toBe(true);
    expect(hit.headers[HEADERS.eventId.toLowerCase()]).toBe(outbox.eventId);
    const delivery = await db.webhookDelivery.findFirstOrThrow({
      where: { eventId: outbox.eventId },
      include: { attempts: true },
    });
    expect(delivery).toMatchObject({ status: "SUCCESS", merchantId });
    expect(delivery.attempts).toHaveLength(1);

    // The request's correlation id crossed the real broker to the consumer.
    expect(seenCorrelation).toEqual([CORRELATION]);
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: outbox.id } })).publishedAt)
      .not.toBeNull();
  });

  it("stays at one each when the broker delivers the same event again (at-least-once)", async () => {
    const parcel = await newParcel(true);
    await pickUp(parcel.id, parcel.version);
    await relay();
    await until(() => hits.length >= 1 && emails.length >= 1);

    // Simulate a relay crash between broker confirm and commit: the same row is published again.
    await db.$executeRaw`UPDATE outbox_events SET published_at = NULL`;
    expect(await relay()).toMatchObject({ claimed: 1, published: 1 });
    await settle(3000);

    expect(emails).toHaveLength(1);
    expect(hits).toHaveLength(1);
    expect(await db.webhookDelivery.count()).toBe(1);
    expect(await db.$queryRaw`SELECT 1 FROM notification_logs`).toHaveLength(1);
  });

  it("notifies the customer but sends no webhook for a parcel without a merchant", async () => {
    const parcel = await newParcel(false);
    await pickUp(parcel.id, parcel.version);
    await relay();
    await until(() => emails.length >= 1);
    await settle();

    expect(emails).toHaveLength(1);
    expect(hits).toHaveLength(0);
    expect(await db.webhookDelivery.count()).toBe(0);
  });

  it("keeps two parcels' updates independent: one notification and one webhook each", async () => {
    const [a, b] = [await newParcel(true), await newParcel(true)];
    await pickUp(a.id, a.version);
    await pickUp(b.id, b.version);
    expect(await relay()).toMatchObject({ claimed: 2, published: 2 });
    await until(() => hits.length >= 2 && emails.length >= 2);
    await settle();

    expect(emails).toHaveLength(2);
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map((h) => JSON.parse(h.body).eventId)).size).toBe(2);
    expect(await db.webhookDelivery.count()).toBe(2);
  });
});
