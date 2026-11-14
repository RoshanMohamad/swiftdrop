import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { Redis } from "ioredis";
import { UnsecuredJWT } from "jose";
import { io as createClient, type Socket } from "socket.io-client";
import pino from "pino";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import type { Database } from "@swiftdrop/db";
import type { PublicUser, SwiftDropEvent } from "@swiftdrop/contracts";
import { EXCHANGES } from "@swiftdrop/messaging";
import type { AuthService } from "../src/modules/auth/index.js";
import { startRealtimeConsumer } from "../src/modules/realtime/consumer.js";
import { createRealtimeGateway } from "../src/modules/realtime/gateway.js";
import type { RealtimeAccessPolicy } from "../src/modules/realtime/policy.js";

const parcelId = "22222222-2222-4222-8222-222222222222";
const trackingNumber = "SD00000000";
const logger = pino({ enabled: false });
const customer: PublicUser = {
  id: 7,
  email: "customer@example.test",
  fullName: "Customer",
  phone: "+94771234567",
  role: "CUSTOMER",
  status: "ACTIVE",
  emailVerified: true,
  profileComplete: true,
};

let redisContainer: StartedTestContainer;
let rabbitContainer: StartedTestContainer;
let redis: Redis;
let server: HttpServer;
let gateway: Awaited<ReturnType<typeof createRealtimeGateway>>;
let consumer: ReturnType<typeof startRealtimeConsumer>;
let publisherConnection: ChannelModel;
let publisher: ConfirmChannel;
let baseUrl: string;
let sockets: Socket[] = [];
let currentUser: PublicUser = customer;
let authValid = true;
let policyAllowed = true;

const until = async (check: () => boolean | Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for realtime condition.");
};

const auth = {
  authenticate: async () => {
    if (!authValid) throw new Error("UNAUTHENTICATED");
    return { user: currentUser, jti: "grant-id", familyId: "family-id" };
  },
} as unknown as AuthService;
const policy: RealtimeAccessPolicy = {
  canJoinPrivate: async () => policyAllowed,
};
const db = {
  parcel: { findUnique: async () => ({ id: parcelId }) },
} as unknown as Database;

function token(expirySeconds = 60) {
  return new UnsecuredJWT({})
    .setExpirationTime(Math.floor(Date.now() / 1000) + expirySeconds)
    .encode();
}

async function socket(expirySeconds = 60) {
  const client = createClient(baseUrl, {
    transports: ["websocket"],
    auth: { token: token(expirySeconds) },
  });
  sockets.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}

function join(client: Socket, request: unknown) {
  return new Promise<{ ok: boolean; code?: string }>((resolve) =>
    client.emit("room:join", request, resolve),
  );
}

function statusEvent(sequence: number): SwiftDropEvent {
  return {
    eventId: randomUUID(),
    type: "parcel.status.changed",
    version: 1,
    occurredAt: "2026-11-14T08:00:00.000Z",
    sequence,
    data: {
      parcelId,
      trackingNo: trackingNumber,
      from: "CREATED",
      to: "IN_TRANSIT",
      town: "Colombo",
      occurredAt: "2026-11-14T08:00:00.000Z",
    },
  };
}

async function publish(event: SwiftDropEvent, messageId = event.eventId) {
  publisher.publish(
    EXCHANGES.events,
    event.type,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, messageId },
  );
  await publisher.waitForConfirms();
}

beforeAll(async () => {
  [redisContainer, rabbitContainer] = await Promise.all([
    new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
      .start(),
    new GenericContainer("rabbitmq:4-management")
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage("Server startup complete"))
      .start(),
  ]);
  redis = new Redis(
    `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`,
  );
  await redis.ping();
  server = createServer((_request, response) => response.end("ok"));
  gateway = await createRealtimeGateway({
    server,
    db,
    redis,
    auth,
    policy,
    origin: "http://127.0.0.1",
    logger,
    privateRecheckMs: 50,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const rabbitUrl = `amqp://guest:guest@${rabbitContainer.getHost()}:${rabbitContainer.getMappedPort(5672)}`;
  consumer = startRealtimeConsumer({
    url: rabbitUrl,
    publish: gateway.publish,
    logger,
    prefetch: 4,
  });
  await until(() => consumer.state.connected);
  publisherConnection = await connect(rabbitUrl);
  publisher = await publisherConnection.createConfirmChannel();
}, 180_000);

beforeEach(async () => {
  for (const client of sockets) client.disconnect();
  sockets = [];
  currentUser = customer;
  authValid = true;
  policyAllowed = true;
  await redis.flushdb();
});

afterAll(async () => {
  for (const client of sockets) client.disconnect();
  await consumer?.stop();
  await publisherConnection?.close().catch(() => undefined);
  await gateway?.close();
  if (server?.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  redis?.disconnect();
  await Promise.all([
    rabbitContainer?.stop(),
    redisContainer?.stop(),
  ]);
});

describe("realtime over real Redis and RabbitMQ", () => {
  it("preserves public privacy, ordering, gap recovery and reconnect recovery", async () => {
    const first = await socket();
    await expect(
      join(first, { kind: "public", trackingNumber }),
    ).resolves.toEqual({ ok: true });
    const update = new Promise<Record<string, unknown>>((resolve) =>
      first.once("parcel:status", resolve),
    );
    await publish(statusEvent(1));
    expect(await update).toEqual({
      status: "IN_TRANSIT",
      occurredAt: "2026-11-14T08:00:00.000Z",
      town: "Colombo",
      sequence: 1,
    });

    let duplicate = false;
    first.once("parcel:status", () => (duplicate = true));
    await publish(statusEvent(1));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(duplicate).toBe(false);

    const gap = new Promise<Record<string, unknown>>((resolve) =>
      first.once("parcel:reload", resolve),
    );
    await publish(statusEvent(3));
    await expect(gap).resolves.toEqual({ reason: "gap", sequence: 3 });
    first.disconnect();

    const reconnected = await socket();
    const reload = new Promise<Record<string, unknown>>((resolve) =>
      reconnected.once("parcel:reload", resolve),
    );
    await join(reconnected, {
      kind: "public",
      trackingNumber,
      lastSequence: 3,
    });
    await expect(reload).resolves.toEqual({
      reason: "reconnect",
      sequence: 3,
    });
  });

  it("reauthorizes private membership and leaves public tracking connected", async () => {
    const publicClient = await socket();
    await join(publicClient, { kind: "public", trackingNumber });
    const privateClient = await socket();
    policyAllowed = false;
    await expect(
      join(privateClient, { kind: "private", parcelId }),
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
    policyAllowed = true;
    await expect(
      join(privateClient, { kind: "private", parcelId }),
    ).resolves.toEqual({ ok: true });
    const evicted = new Promise<Record<string, unknown>>((resolve) =>
      privateClient.once("room:evicted", resolve),
    );
    authValid = false;
    await expect(evicted).resolves.toEqual({ reason: "revoked" });
    expect(publicClient.connected).toBe(true);
  });

  it("evicts only the old courier on assignment and evicts at token expiry", async () => {
    currentUser = { ...customer, id: 19, role: "COURIER" };
    const courier = await socket();
    await join(courier, { kind: "private", parcelId });
    const reassigned = new Promise<Record<string, unknown>>((resolve) =>
      courier.once("room:evicted", resolve),
    );
    await publish({
      eventId: randomUUID(),
      type: "parcel.assignment.changed",
      version: 1,
      occurredAt: "2026-11-14T08:01:00.000Z",
      sequence: 1,
      data: {
        parcelId,
        trackingNo: trackingNumber,
        oldCourierId: "19",
        newCourierId: "20",
      },
    });
    await expect(reassigned).resolves.toEqual({ reason: "reassigned" });

    currentUser = customer;
    const expiring = await socket(1);
    const expired = new Promise<Record<string, unknown>>((resolve) =>
      expiring.once("room:evicted", resolve),
    );
    await join(expiring, { kind: "private", parcelId });
    await expect(expired).resolves.toEqual({ reason: "expired" });
  });

  it("discards a messageId mismatch without emitting", async () => {
    const client = await socket();
    await join(client, { kind: "public", trackingNumber });
    let emitted = false;
    client.once("parcel:status", () => (emitted = true));
    await publish(statusEvent(1), randomUUID());
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(emitted).toBe(false);
  });
});
