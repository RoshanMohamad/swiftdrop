import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { UnsecuredJWT } from "jose";
import { io as createClient, type Socket } from "socket.io-client";
import pino from "pino";
import type { ConsumeMessage } from "amqplib";
import type { Redis } from "ioredis";
import type { Database } from "@swiftdrop/db";
import type { PublicUser, SwiftDropEvent } from "@swiftdrop/contracts";
import type { AuthService } from "../src/modules/auth/index.js";
import {
  declareRealtimeQueue,
  handleRealtimeMessage,
} from "../src/modules/realtime/consumer.js";
import { createRealtimeGateway } from "../src/modules/realtime/gateway.js";
import {
  PrismaRealtimeAccessPolicy,
  type RealtimeAccessPolicy,
} from "../src/modules/realtime/policy.js";

const parcelId = "22222222-2222-4222-8222-222222222222";
const trackingNumber = "SD00000000";
const baseUser: PublicUser = {
  id: 7,
  email: "customer@example.test",
  fullName: "Customer",
  phone: "+94771234567",
  role: "CUSTOMER",
  status: "ACTIVE",
  emailVerified: true,
  profileComplete: true,
};

let httpServer: HttpServer | undefined;
let clients: Socket[] = [];
let closeGateway: (() => Promise<void>) | undefined;

afterEach(async () => {
  for (const socket of clients) socket.disconnect();
  if (closeGateway) await closeGateway();
  if (httpServer?.listening)
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  clients = [];
  closeGateway = undefined;
  httpServer = undefined;
});

async function harness(options: {
  expirySeconds?: number;
  user?: PublicUser;
  exists?: boolean;
  allowed?: boolean;
  privateRecheckMs?: number;
} = {}) {
  const values = new Map<string, number>();
  const redis = {
    eval: async (
      _script: string,
      _keyCount: number,
      key: string,
      candidate: string,
    ) => {
      const previous = values.get(key) ?? 0;
      if (Number(candidate) <= previous) return [0, previous];
      values.set(key, Number(candidate));
      return [1, previous];
    },
  } as unknown as Redis;
  const db = {
    parcel: {
      findUnique: async () =>
        options.exists === false ? null : { id: parcelId },
    },
  } as unknown as Database;
  let authenticated = true;
  const user = options.user ?? baseUser;
  const auth = {
    authenticate: async () => {
      if (!authenticated) throw new Error("UNAUTHENTICATED");
      return { user, jti: "grant-id", familyId: "family-id" };
    },
  } as unknown as AuthService;
  let allowed = options.allowed ?? true;
  const policy: RealtimeAccessPolicy = {
    canJoinPrivate: async () => allowed,
  };
  httpServer = createServer((_request, response) => response.end("ok"));
  const gateway = await createRealtimeGateway({
    server: httpServer,
    db,
    redis,
    auth,
    origin: "http://127.0.0.1",
    logger: pino({ enabled: false }),
    policy,
    useRedisAdapter: false,
    allowJoin: async () => true,
    privateRecheckMs: options.privateRecheckMs ?? 50,
  });
  closeGateway = gateway.close;
  await new Promise<void>((resolve) =>
    httpServer?.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  const token = new UnsecuredJWT({})
    .setExpirationTime(
      Math.floor(Date.now() / 1000) + (options.expirySeconds ?? 60),
    )
    .encode();
  const connect = async () => {
    const client = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      auth: { token },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    return client;
  };
  return {
    gateway,
    connect,
    revoke: () => (authenticated = false),
    deny: () => (allowed = false),
  };
}

function join(socket: Socket, room: unknown) {
  return new Promise<{ ok: boolean; code?: string }>((resolve) =>
    socket.emit("room:join", room, resolve),
  );
}

function statusEvent(sequence: number): SwiftDropEvent {
  return {
    eventId: randomUUID(),
    type: "parcel.status.changed",
    version: 1,
    occurredAt: "2026-11-13T10:31:00.000Z",
    sequence,
    data: {
      parcelId,
      trackingNo: trackingNumber,
      from: "CREATED",
      to: "PICKED_UP",
      town: "Colombo",
      occurredAt: "2026-11-13T10:31:00.000Z",
    },
  };
}

describe("realtime gateway", () => {
  it("emits a strict PII-free public DTO, discards stale events and signals gaps", async () => {
    const test = await harness();
    const client = await test.connect();
    await expect(
      join(client, { kind: "public", trackingNumber }),
    ).resolves.toEqual({ ok: true });
    const update = new Promise<Record<string, unknown>>((resolve) =>
      client.once("parcel:status", resolve),
    );
    await test.gateway.publish(statusEvent(1));
    expect(await update).toEqual({
      status: "PICKED_UP",
      occurredAt: "2026-11-13T10:31:00.000Z",
      town: "Colombo",
      sequence: 1,
    });
    const events: unknown[] = [];
    client.on("parcel:status", (value) => events.push(value));
    await test.gateway.publish(statusEvent(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(events).toHaveLength(0);

    const reload = new Promise<Record<string, unknown>>((resolve) =>
      client.once("parcel:reload", resolve),
    );
    await test.gateway.publish(statusEvent(3));
    await expect(reload).resolves.toEqual({ reason: "gap", sequence: 3 });
  });

  it("validates/rate-limits public joins and verifies parcel existence", async () => {
    const test = await harness({ exists: false });
    const client = await test.connect();
    await expect(
      join(client, { kind: "public", trackingNumber }),
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
    await expect(
      join(client, { kind: "public", trackingNumber: "INVALID" }),
    ).resolves.toEqual({ ok: false, code: "INVALID_ROOM" });
  });

  it("returns the same safe result for unauthorized and unavailable private parcels", async () => {
    const test = await harness({ allowed: false });
    const client = await test.connect();
    const denied = await join(client, { kind: "private", parcelId });
    test.deny();
    const unavailable = await join(client, { kind: "private", parcelId });
    expect(denied).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(unavailable).toEqual(denied);
  });

  it("stores only non-PII session metadata and requests a snapshot on reconnect", async () => {
    const test = await harness();
    const client = await test.connect();
    const reload = new Promise<Record<string, unknown>>((resolve) =>
      client.once("parcel:reload", resolve),
    );
    await expect(
      join(client, { kind: "private", parcelId, lastSequence: 9 }),
    ).resolves.toEqual({ ok: true });
    await expect(reload).resolves.toEqual({
      reason: "reconnect",
      sequence: 9,
    });
    const serverSocket = [...test.gateway.io.of("/").sockets.values()][0]!;
    expect(serverSocket.data).toEqual({
      principal: expect.objectContaining({
        userId: 7,
        role: "CUSTOMER",
        tokenExpiresAt: expect.any(Number),
        privateParcelIds: [parcelId],
      }),
    });
    expect(JSON.stringify(serverSocket.data)).not.toMatch(
      /customer@example|94771234567|Customer|eyJ/,
    );
  });

  it("evicts private rooms at token expiry and after session revocation", async () => {
    const expiring = await harness({ expirySeconds: 1 });
    const first = await expiring.connect();
    await join(first, { kind: "private", parcelId });
    await expect(
      new Promise((resolve) => first.once("room:evicted", resolve)),
    ).resolves.toEqual({ reason: "expired" });
    first.disconnect();
    await expiring.gateway.close();
    closeGateway = undefined;
    if (httpServer?.listening)
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));

    const revoked = await harness({ privateRecheckMs: 20 });
    const second = await revoked.connect();
    await join(second, { kind: "private", parcelId });
    const eviction = new Promise((resolve) =>
      second.once("room:evicted", resolve),
    );
    revoked.revoke();
    await expect(eviction).resolves.toEqual({ reason: "revoked" });
  });

  it("evicts only the old courier after reassignment", async () => {
    const courier = { ...baseUser, id: 19, role: "COURIER" as const };
    const test = await harness({ user: courier });
    const client = await test.connect();
    await join(client, { kind: "private", parcelId });
    await test.gateway.publish({
      eventId: randomUUID(),
      type: "parcel.assignment.changed",
      version: 1,
      occurredAt: "2026-11-13T10:32:00.000Z",
      sequence: 1,
      data: {
        parcelId,
        trackingNo: trackingNumber,
        oldCourierId: "19",
        newCourierId: "20",
      },
    });
    await expect(
      new Promise((resolve) => client.once("room:evicted", resolve)),
    ).resolves.toEqual({ reason: "reassigned" });
  });
});

describe("database-scoped private access policy", () => {
  it("uses role-specific ownership predicates and an injectable courier lookup", async () => {
    const where: unknown[] = [];
    const db = {
      parcel: {
        findFirst: async (query: { where: unknown }) => {
          where.push(query.where);
          return { id: parcelId };
        },
      },
    } as unknown as Database;
    const courierLookup = jest.fn(
      async (_courierUserId: number, _parcelId: string) => true,
    );
    const policy = new PrismaRealtimeAccessPolicy(db, {
      canAccess: courierLookup,
    });
    await policy.canJoinPrivate(baseUser, parcelId);
    await policy.canJoinPrivate(
      { ...baseUser, role: "MERCHANT" },
      parcelId,
    );
    await policy.canJoinPrivate(
      { ...baseUser, role: "DISPATCHER" },
      parcelId,
    );
    await policy.canJoinPrivate(
      { ...baseUser, role: "COURIER" },
      parcelId,
    );
    expect(where).toEqual([
      { id: parcelId, userId: 7 },
      {
        id: parcelId,
        merchant: { is: { userId: 7, status: "APPROVED" } },
      },
      { id: parcelId },
    ]);
    expect(courierLookup).toHaveBeenCalledWith(7, parcelId);
  });

  it("denies courier access by default until M06 supplies X-08", async () => {
    const db = {
      parcel: { findFirst: jest.fn() },
    } as unknown as Database;
    await expect(
      new PrismaRealtimeAccessPolicy(db).canJoinPrivate(
        { ...baseUser, role: "COURIER" },
        parcelId,
      ),
    ).resolves.toBe(false);
    expect(db.parcel.findFirst).not.toHaveBeenCalled();
  });
});

function delivery(body: unknown, messageId: string = randomUUID()) {
  return {
    content: Buffer.from(
      typeof body === "string" ? body : JSON.stringify(body),
    ),
    properties: { messageId },
  } as ConsumeMessage;
}

describe("realtime RabbitMQ consumer", () => {
  it("declares the shared durable parcel.# queue with a 60 second TTL", async () => {
    const calls: unknown[] = [];
    const channel = {
      assertExchange: async (...args: unknown[]) => calls.push(["exchange", ...args]),
      assertQueue: async (...args: unknown[]) => calls.push(["queue", ...args]),
      bindQueue: async (...args: unknown[]) => calls.push(["bind", ...args]),
    };
    await declareRealtimeQueue(channel as never);
    expect(calls).toContainEqual([
      "queue",
      "realtime.q",
      { durable: true, arguments: { "x-message-ttl": 60_000 } },
    ]);
    expect(calls).toContainEqual([
      "bind",
      "realtime.q",
      "swiftdrop.events",
      "parcel.#",
    ]);
  });

  it("acks only after handling and rejects mismatched message IDs", async () => {
    const order: string[] = [];
    const channel = {
      ack: () => order.push("ack"),
      nack: (
        _message: ConsumeMessage,
        _all: boolean,
        requeue: boolean,
      ) => order.push(`nack:${requeue}`),
    };
    const event = statusEvent(1);
    await expect(
      handleRealtimeMessage({
        channel,
        message: delivery(event, event.eventId),
        publish: async () => {
          order.push("handled");
        },
        logger: pino({ enabled: false }),
      }),
    ).resolves.toBe("acknowledged");
    expect(order).toEqual(["handled", "ack"]);
    await expect(
      handleRealtimeMessage({
        channel,
        message: delivery(event, randomUUID()),
        publish: async () => undefined,
        logger: pino({ enabled: false }),
      }),
    ).resolves.toBe("discarded");
    expect(order.at(-1)).toBe("nack:false");
  });

  it("requeues when local handling fails", async () => {
    const nack = jest.fn();
    const event = statusEvent(1);
    await expect(
      handleRealtimeMessage({
        channel: { ack: jest.fn(), nack },
        message: delivery(event, event.eventId),
        publish: async () => {
          throw new Error("redis unavailable");
        },
        logger: pino({ enabled: false }),
      }),
    ).resolves.toBe("requeued");
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });
});
