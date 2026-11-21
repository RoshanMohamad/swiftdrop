import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { formatTrackingNumber, type PublicUser } from "@swiftdrop/contracts";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { UnsecuredJWT, decodeJwt } from "jose";
import type { Database } from "@swiftdrop/db";
import type { Redis } from "ioredis";
import pino from "pino";
import { createRealtimeGateway } from "../src/modules/realtime/gateway.js";
import type {
  PrivateAccess,
  RealtimeUser,
} from "../src/modules/realtime/access.js";
import type { ParcelSnapshot, SwiftDropEvent } from "@swiftdrop/contracts";
const PARCEL = "11111111-1111-4111-8111-111111111111";
const OTHER_PARCEL = "33333333-3333-4333-8333-333333333333";

const validTracking = formatTrackingNumber("7KQ2M9XA");

const statusEvent = (
  to: "PICKED_UP" | "DELIVERED",
  sequence = 2,
): SwiftDropEvent => ({
  eventId: "22222222-2222-4222-8222-222222222222",
  type: "parcel.status.changed",
  version: 1,
  occurredAt: "2026-11-13T10:00:00.000Z",
  sequence,
  data: {
    parcelId: PARCEL,
    trackingNo: validTracking,
    courierId: "9",
    from: "CREATED",
    to,
    town: "Colombo",
    occurredAt: "2026-11-13T10:00:00.000Z",
  },
});
const assignment = (oldCourierId?: string): SwiftDropEvent => ({
  eventId: "44444444-4444-4444-8444-444444444444",
  type: "parcel.assignment.changed",
  version: 1,
  occurredAt: "2026-11-13T10:05:00.000Z",
  sequence: 3,
  data: {
    parcelId: PARCEL,
    trackingNo: validTracking,
    newCourierId: "9",
    ...(oldCourierId ? { oldCourierId } : {}),
  },
});

describe("realtime gateway (FR-I6)", () => {
  let http: HttpServer;
  let gateway: Awaited<ReturnType<typeof createRealtimeGateway>>;
  let url: string;
  const sockets: Socket[] = [];
  let reassignedAway = false;

  const users: Record<string, RealtimeUser> = {
    owner: { id: 1, role: "CUSTOMER" },
    stranger: { id: 2, role: "CUSTOMER" },
    courier: { id: 9, role: "COURIER" },
  };
  const access = {
    snapshotFor: async (user: RealtimeUser, parcelId: string) => {
      const allowed =
        parcelId === PARCEL &&
        (user.id === 1 || (user.id === 9 && !reassignedAway));
      return allowed
        ? ({
            parcelId,
            trackingNumber: validTracking,
            status: "PICKED_UP",
            version: 3,
            history: [],
          } satisfies ParcelSnapshot)
        : null;
    },
  } as unknown as PrivateAccess;

  beforeAll(async () => {
    http = createServer();
    gateway = await createRealtimeGateway({
      server: http,
      db: {
        parcel: {
          findUnique: async (q: { where: { trackingNumber: string } }) =>
            q.where.trackingNumber === validTracking ? { id: PARCEL } : null,
        },
      } as unknown as Database,
      redis: { eval: async () => [1, 0] } as unknown as Redis,
      useRedisAdapter: false,
      allowJoin: (() => {
        const counts = new Map<string, number>();
        return async (ip: string) => {
          const count = (counts.get(ip) ?? 0) + 1;
          counts.set(ip, count);
          return count <= 1000;
        };
      })(),
      policy: {
        canJoinPrivate: async (user, id) =>
          Boolean(await access.snapshotFor(user, id)),
      },
      origin: "http://localhost:5173",
      auth: {
        authenticate: async (header) => {
          const token =
            decodeJwt(header?.replace("Bearer ", "") ?? "").sub ?? "";
          const user = users[token];
          if (!user) throw new Error("bad token");
          return { user: user as PublicUser, jti: "grant", familyId: "family" };
        },
      },
      logger: pino({ level: "silent" }),
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await gateway.close();
  });

  const client = async (token?: string) => {
    const socket = connect(url, {
      transports: ["websocket"],
      reconnection: false,
      ...(token
        ? {
            auth: {
              token: new UnsecuredJWT({})
                .setSubject(token)
                .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
                .encode(),
            },
          }
        : {}),
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (error) => reject(error));
    });
    return socket;
  };
  const ask = <T>(socket: Socket, event: string, payload: unknown) =>
    new Promise<T>((resolve) => socket.emit(event, payload, resolve));
  const next = <T>(socket: Socket, event: string) =>
    new Promise<T>((resolve) => socket.once(event, resolve));

  it("lets anyone join a public room and receive only the public projection", async () => {
    const guest = await client();
    const joined = await ask<{ ok: boolean; snapshot?: { status: string } }>(
      guest,
      "track:join",
      { trackingNumber: validTracking },
    );
    expect(joined).toMatchObject({
      ok: true,
    });
    const received = next<Record<string, unknown>>(guest, "parcel:status");
    await gateway.handle(
      Buffer.from(JSON.stringify(statusEvent("DELIVERED", 4))),
    );
    const payload = await received;
    expect(payload).toMatchObject({
      status: "DELIVERED",
      sequence: 4,
      town: "Colombo",
    });
    expect(payload).not.toHaveProperty("parcelId");
  });

  it("rejects bad or unknown tracking numbers", async () => {
    const guest = await client();
    expect(
      await ask(guest, "track:join", { trackingNumber: "nope" }),
    ).toMatchObject({
      ok: false,
      error: "INVALID",
    });
    expect(
      await ask(guest, "track:join", { trackingNumber: "SD1234567A" }),
    ).toMatchObject({
      ok: false,
    });
    const unknown = formatTrackingNumber("4HNP6RTD");
    expect(
      await ask(guest, "track:join", { trackingNumber: unknown }),
    ).toMatchObject({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("refuses unauthenticated private joins and bad tokens", async () => {
    const guest = await client();
    expect(await ask(guest, "parcel:join", { parcelId: PARCEL })).toMatchObject(
      {
        ok: false,
        error: "UNAUTHENTICATED",
      },
    );
    const invalid = await client("not-a-user");
    expect(
      await ask(invalid, "parcel:join", { parcelId: PARCEL }),
    ).toMatchObject({ ok: false, error: "UNAUTHENTICATED" });
  });

  it("authorises private rooms per user and treats foreign parcels like missing ones", async () => {
    const owner = await client("owner");
    const stranger = await client("stranger");
    expect(await ask(owner, "parcel:join", { parcelId: PARCEL })).toMatchObject(
      {
        ok: true,
      },
    );
    expect(await ask(stranger, "parcel:join", { parcelId: PARCEL })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(await ask(owner, "parcel:join", { parcelId: OTHER_PARCEL })).toEqual(
      {
        ok: false,
        error: "NOT_FOUND",
      },
    );
    const received = next<Record<string, unknown>>(owner, "parcel:status");
    await gateway.handle(
      Buffer.from(JSON.stringify(statusEvent("DELIVERED", 5))),
    );
    expect(await received).toMatchObject({
      parcelId: PARCEL,
      status: "DELIVERED",
    });
  });

  it("revokes a courier's private room on reassignment and notifies their user room", async () => {
    const courier = await client("courier");
    expect(
      await ask(courier, "parcel:join", { parcelId: PARCEL }),
    ).toMatchObject({ ok: true });
    const assigned: Array<{ change: string }> = [];
    const statuses: unknown[] = [];
    courier.on("parcel:assigned", (value) => assigned.push(value));
    courier.on("parcel:status", (value) => statuses.push(value));

    // Parcel moves from courier 9 to courier 3; the fixture's access check now denies courier 9.
    reassignedAway = true;
    const away = {
      ...assignment("9"),
      data: { ...assignment("9").data, newCourierId: "3" },
    };
    await gateway.handle(Buffer.from(JSON.stringify(away)));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(assigned.map((item) => item.change)).toContain("unassigned");

    await gateway.handle(
      Buffer.from(JSON.stringify(statusEvent("DELIVERED", 6))),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(statuses).toEqual([]); // left private:<parcel>, nothing more arrives
    expect(
      await ask(courier, "parcel:join", { parcelId: PARCEL }),
    ).toMatchObject({ ok: false });
    reassignedAway = false;
  });

  it("throttles join attempts per socket", async () => {
    const guest = await client();
    const answers: Array<{ ok: boolean; error?: string }> = [];
    for (let attempt = 0; attempt < 32; attempt++)
      answers.push(
        await ask(guest, "track:join", { trackingNumber: validTracking }),
      );
    expect(answers.slice(0, 30).every((answer) => answer.ok)).toBe(true);
    expect(answers[30]).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("ignores malformed broker messages", async () => {
    await expect(
      gateway.handle(Buffer.from("not json")),
    ).resolves.toBeUndefined();
    await expect(
      gateway.handle(Buffer.from(JSON.stringify({ type: "parcel.created" }))),
    ).resolves.toBeUndefined();
  });
});
