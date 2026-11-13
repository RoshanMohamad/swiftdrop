import { afterEach, describe, expect, it } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import { UnsecuredJWT } from "jose";
import { io as createClient, type Socket } from "socket.io-client";
import pino from "pino";
import type { Redis } from "ioredis";
import type { Database } from "@swiftdrop/db";
import type { AuthService } from "../src/modules/auth/index.js";
import { createRealtimeGateway } from "../src/modules/realtime/gateway.js";
import type { RealtimeAccessPolicy } from "../src/modules/realtime/policy.js";

const parcelId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: 7,
  email: "customer@example.test",
  fullName: "Customer",
  phone: "+94771234567",
  role: "CUSTOMER" as const,
  status: "ACTIVE" as const,
  emailVerified: true,
  profileComplete: true,
};

let httpServer: HttpServer | undefined;
let client: Socket | undefined;
let closeGateway: (() => Promise<void>) | undefined;

afterEach(async () => {
  client?.disconnect();
  if (closeGateway) await closeGateway();
  if (httpServer?.listening)
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  client = undefined;
  closeGateway = undefined;
  httpServer = undefined;
});

async function harness(expirySeconds = 60) {
  const values = new Map<string, string>();
  const redis = {
    eval: async (
      _script: string,
      _keyCount: number,
      key: string,
      candidate: string,
    ) => {
      if (Number(candidate) <= Number(values.get(key) ?? 0)) return 0;
      values.set(key, candidate);
      return 1;
    },
  } as unknown as Redis;
  const db = {
    parcel: {
      findUnique: async () => ({ id: parcelId }),
    },
  } as unknown as Database;
  const auth = {
    authenticate: async () => ({ user, jti: "jti", familyId: "family" }),
  } as unknown as AuthService;
  const policy: RealtimeAccessPolicy = { canJoinPrivate: async () => true };
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
  });
  closeGateway = gateway.close;
  await new Promise<void>((resolve) =>
    httpServer?.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  const token = new UnsecuredJWT({})
    .setExpirationTime(Math.floor(Date.now() / 1000) + expirySeconds)
    .encode();
  client = createClient(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    auth: { token },
  });
  await new Promise<void>((resolve, reject) => {
    client?.once("connect", resolve);
    client?.once("connect_error", reject);
  });
  return { gateway, client };
}

function join(socket: Socket, room: unknown) {
  return new Promise<{ ok: boolean; code?: string }>((resolve) =>
    socket.emit("room:join", room, resolve),
  );
}

describe("realtime gateway", () => {
  it("emits a PII-free public projection and ignores a stale sequence", async () => {
    const test = await harness();
    await expect(
      join(test.client, { kind: "public", trackingNumber: "SD00000000" }),
    ).resolves.toEqual({ ok: true });
    const received = new Promise<Record<string, unknown>>((resolve) =>
      test.client.once("parcel:status", resolve),
    );
    const event = {
      eventId: "11111111-1111-4111-8111-111111111111",
      type: "parcel.status.changed" as const,
      version: 1 as const,
      occurredAt: "2026-11-13T10:31:00.000Z",
      sequence: 2,
      data: {
        parcelId,
        trackingNo: "SD00000000",
        from: "CREATED" as const,
        to: "PICKED_UP" as const,
        town: "Colombo",
        occurredAt: "2026-11-13T10:31:00.000Z",
      },
    };
    await test.gateway.publish(event);
    expect(await received).toEqual({
      status: "PICKED_UP",
      occurredAt: "2026-11-13T10:31:00.000Z",
      town: "Colombo",
      sequence: 2,
    });
    await expect(test.gateway.publish(event)).resolves.toBeUndefined();
  });

  it("evicts private membership when an assignment changes", async () => {
    const test = await harness();
    await expect(
      join(test.client, { kind: "private", parcelId }),
    ).resolves.toEqual({ ok: true });
    const evicted = new Promise<Record<string, unknown>>((resolve) =>
      test.client.once("room:evicted", resolve),
    );
    await test.gateway.publish({
      eventId: "33333333-3333-4333-8333-333333333333",
      type: "parcel.assignment.changed",
      version: 1,
      occurredAt: "2026-11-13T10:32:00.000Z",
      sequence: 3,
      data: {
        parcelId,
        trackingNo: "SD00000000",
        oldCourierId: "courier-1",
        newCourierId: "courier-2",
      },
    });
    await expect(evicted).resolves.toEqual({ reason: "reassigned" });
  });

  it("evicts private membership when the access token expires", async () => {
    const test = await harness(1);
    await expect(
      join(test.client, { kind: "private", parcelId }),
    ).resolves.toEqual({ ok: true });
    await expect(
      new Promise<Record<string, unknown>>((resolve) =>
        test.client.once("room:evicted", resolve),
      ),
    ).resolves.toEqual({ reason: "expired" });
  });
});
