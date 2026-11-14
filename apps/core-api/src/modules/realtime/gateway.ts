import type { Server as HttpServer } from "node:http";
import { createHash } from "node:crypto";
import { decodeJwt } from "jose";
import { Server, type RemoteSocket, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import {
  privateRealtimeUpdateSchema,
  publicRealtimeUpdateSchema,
  realtimeEvictionSchema,
  realtimeJoinSchema,
  realtimeReloadSchema,
  trackingNumberSchema,
  type RealtimeClientToServerEvents,
  type RealtimeServerToClientEvents,
  type Role,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";
import type { AuthService } from "../auth/index.js";
import {
  PrismaRealtimeAccessPolicy,
  type RealtimeAccessPolicy,
} from "./policy.js";

type RealtimePrincipal = {
  userId: number;
  role: Role;
  grantId: string;
  familyId: string;
  tokenExpiresAt: number;
  privateParcelIds: string[];
};

export type RealtimeSocketData = {
  /** Deliberately excludes token, email, phone, name, address and parcel data. */
  principal?: RealtimePrincipal;
};

type RealtimeSocket = Socket<
  RealtimeClientToServerEvents,
  RealtimeServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;
type RealtimeRemoteSocket = RemoteSocket<
  RealtimeServerToClientEvents,
  RealtimeSocketData
>;
type LocalSession = {
  token: string;
  expiryTimer?: ReturnType<typeof setTimeout>;
  recheckTimer?: ReturnType<typeof setTimeout>;
};

const publicRoom = (trackingNumber: string) => `public:${trackingNumber}`;
const privateRoom = (parcelId: string) => `private:${parcelId}`;
const SEQUENCE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_PRIVATE_RECHECK_MS = 30_000;

// Returns [advanced, previous]. Redis makes stale suppression and gap detection
// atomic across Core API replicas before the Redis Socket.IO adapter broadcasts.
const ADVANCE_SEQUENCE = `
  local current = tonumber(redis.call("GET", KEYS[1]) or "0")
  local candidate = tonumber(ARGV[1])
  if candidate <= current then return {0, current} end
  redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
  return {1, current}
`;

function privateRooms(socket: { rooms: Set<string> }) {
  return [...socket.rooms].filter((room) => room.startsWith("private:"));
}

async function leaveRoom(
  socket: RealtimeSocket | RealtimeRemoteSocket,
  room: string,
) {
  await socket.leave(room);
  const principal = socket.data.principal;
  if (principal)
    principal.privateParcelIds = principal.privateParcelIds.filter(
      (parcelId) => privateRoom(parcelId) !== room,
    );
}

export async function createRealtimeGateway(input: {
  server: HttpServer;
  db: Database;
  redis: Redis;
  auth: Pick<AuthService, "authenticate">;
  origin: string;
  logger: Logger;
  policy?: RealtimeAccessPolicy;
  useRedisAdapter?: boolean;
  allowJoin?: (address: string) => Promise<boolean>;
  privateRecheckMs?: number;
}) {
  const io = new Server<
    RealtimeClientToServerEvents,
    RealtimeServerToClientEvents,
    Record<string, never>,
    RealtimeSocketData
  >(input.server, {
    path: "/socket.io",
    cors: { origin: input.origin, credentials: true },
    transports: ["polling", "websocket"],
  });
  const publisher =
    input.useRedisAdapter === false
      ? undefined
      : input.redis.duplicate({
          enableOfflineQueue: true,
          maxRetriesPerRequest: null,
        });
  const subscriber =
    input.useRedisAdapter === false
      ? undefined
      : input.redis.duplicate({
          enableOfflineQueue: true,
          maxRetriesPerRequest: null,
        });
  if (publisher && subscriber) {
    // The adapter handles cross-replica broadcasts. Polling still requires
    // reverse-proxy stickiness; Socket.IO cannot provide that by itself.
    io.adapter(createAdapter(publisher, subscriber));
    for (const client of [publisher, subscriber])
      client.on("error", () =>
        input.logger.warn(
          { error: "REDIS_ADAPTER_UNAVAILABLE" },
          "Realtime Redis adapter unavailable",
        ),
      );
  }

  const policy = input.policy ?? new PrismaRealtimeAccessPolicy(input.db);
  const allowJoin =
    input.allowJoin ??
    (async (address: string) => {
      const digest = createHash("sha256").update(address).digest("hex");
      const key = `realtime:join:${digest}`;
      const count = await input.redis.incr(key);
      if (count === 1) await input.redis.expire(key, 60);
      return count <= 30;
    });
  const privateRecheckMs =
    input.privateRecheckMs ?? DEFAULT_PRIVATE_RECHECK_MS;
  if (!Number.isSafeInteger(privateRecheckMs) || privateRecheckMs < 10)
    throw new Error("privateRecheckMs must be at least 10 ms.");
  const localSessions = new Map<string, LocalSession>();

  function clearLocalSession(socketId: string) {
    const session = localSessions.get(socketId);
    if (!session) return;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    if (session.recheckTimer) clearTimeout(session.recheckTimer);
    localSessions.delete(socketId);
  }

  async function evictLocalPrivateRooms(
    socket: RealtimeSocket,
    reason: "expired" | "revoked",
  ) {
    for (const room of privateRooms(socket)) await leaveRoom(socket, room);
    socket.data.principal = undefined;
    clearLocalSession(socket.id);
    socket.emit("room:evicted", realtimeEvictionSchema.parse({ reason }));
  }

  function scheduleRecheck(socket: RealtimeSocket) {
    const session = localSessions.get(socket.id);
    if (!session) return;
    session.recheckTimer = setTimeout(() => {
      void (async () => {
        const current = localSessions.get(socket.id);
        const principal = socket.data.principal;
        if (!current || current !== session || !principal) return;
        try {
          const authenticated = await input.auth.authenticate(
            `Bearer ${current.token}`,
          );
          if (
            authenticated.user.id !== principal.userId ||
            authenticated.user.role !== principal.role ||
            authenticated.jti !== principal.grantId ||
            authenticated.familyId !== principal.familyId
          )
            throw new Error("SESSION_CHANGED");
          for (const parcelId of [...principal.privateParcelIds]) {
            if (!(await policy.canJoinPrivate(authenticated.user, parcelId))) {
              await leaveRoom(socket, privateRoom(parcelId));
              socket.emit(
                "room:evicted",
                realtimeEvictionSchema.parse({ reason: "revoked" }),
              );
            }
          }
          if (privateRooms(socket).length > 0) scheduleRecheck(socket);
          else clearLocalSession(socket.id);
        } catch {
          await evictLocalPrivateRooms(socket, "revoked");
        }
      })();
    }, privateRecheckMs);
    session.recheckTimer.unref?.();
  }

  function startPrivateSession(
    socket: RealtimeSocket,
    token: string,
    authenticated: Awaited<ReturnType<AuthService["authenticate"]>>,
    parcelId: string,
    expiresAt: number,
  ) {
    const existingParcels = socket.data.principal?.privateParcelIds ?? [];
    clearLocalSession(socket.id);
    socket.data.principal = {
      userId: authenticated.user.id,
      role: authenticated.user.role,
      grantId: authenticated.jti,
      familyId: authenticated.familyId,
      tokenExpiresAt: expiresAt,
      privateParcelIds: [...new Set([...existingParcels, parcelId])],
    };
    const session: LocalSession = { token };
    localSessions.set(socket.id, session);
    session.expiryTimer = setTimeout(() => {
      void evictLocalPrivateRooms(socket, "expired");
    }, Math.max(0, expiresAt * 1000 - Date.now()));
    session.expiryTimer.unref?.();
    scheduleRecheck(socket);
  }

  io.on("connection", (socket) => {
    socket.on("room:join", async (raw, acknowledge) => {
      try {
        const request = realtimeJoinSchema.parse(raw);
        if (request.kind === "public") {
          if (!(await allowJoin(socket.handshake.address)))
            throw new Error("RATE_LIMITED");
          const trackingNumber = trackingNumberSchema.parse(
            request.trackingNumber,
          );
          const exists = await input.db.parcel.findUnique({
            where: { trackingNumber },
            select: { id: true },
          });
          if (!exists) throw new Error("NOT_FOUND");
          await socket.join(publicRoom(trackingNumber));
        } else {
          const token =
            typeof socket.handshake.auth.token === "string"
              ? socket.handshake.auth.token
              : "";
          let authenticated: Awaited<ReturnType<AuthService["authenticate"]>>;
          try {
            authenticated = await input.auth.authenticate(
              token ? `Bearer ${token}` : undefined,
            );
          } catch {
            throw new Error("UNAUTHENTICATED");
          }
          if (
            !(await policy.canJoinPrivate(authenticated.user, request.parcelId))
          )
            throw new Error("NOT_FOUND");
          let expiresAt: number | undefined;
          try {
            expiresAt = decodeJwt(token).exp;
          } catch {
            throw new Error("UNAUTHENTICATED");
          }
          if (!expiresAt || expiresAt * 1000 <= Date.now())
            throw new Error("UNAUTHENTICATED");
          await socket.join(privateRoom(request.parcelId));
          startPrivateSession(
            socket,
            token,
            authenticated,
            request.parcelId,
            expiresAt,
          );
        }
        acknowledge?.({ ok: true });
        if (request.lastSequence && request.lastSequence > 0)
          socket.emit(
            "parcel:reload",
            realtimeReloadSchema.parse({
              reason: "reconnect",
              sequence: request.lastSequence,
            }),
          );
      } catch (error) {
        const code =
          error instanceof Error &&
          ["RATE_LIMITED", "NOT_FOUND", "UNAUTHENTICATED"].includes(
            error.message,
          )
            ? (error.message as
                | "RATE_LIMITED"
                | "NOT_FOUND"
                | "UNAUTHENTICATED")
            : "INVALID_ROOM";
        acknowledge?.({ ok: false, code });
      }
    });
    socket.on("disconnect", () => clearLocalSession(socket.id));
  });

  async function advanceSequence(event: SwiftDropEvent) {
    const raw = await input.redis.eval(
      ADVANCE_SEQUENCE,
      1,
      `realtime:sequence:${event.data.parcelId}`,
      String(event.sequence),
      String(SEQUENCE_TTL_SECONDS),
    );
    if (!Array.isArray(raw) || raw.length !== 2)
      throw new Error("Realtime sequence state returned an invalid result.");
    return { advanced: Number(raw[0]) === 1, previous: Number(raw[1]) };
  }

  async function publish(event: SwiftDropEvent) {
    const sequence = await advanceSequence(event);
    if (!sequence.advanced) return { handled: true, stale: true } as const;
    const gap = event.sequence > sequence.previous + 1;
    if (gap) {
      const reload = realtimeReloadSchema.parse({
        reason: "gap",
        sequence: event.sequence,
      });
      io.to(publicRoom(event.data.trackingNo)).emit("parcel:reload", reload);
      io.to(privateRoom(event.data.parcelId)).emit("parcel:reload", reload);
    }

    if (event.type === "parcel.assignment.changed") {
      const room = privateRoom(event.data.parcelId);
      const sockets = await io.in(room).fetchSockets();
      const oldCourierId = event.data.oldCourierId;
      for (const socket of sockets) {
        const principal = socket.data.principal;
        if (
          principal?.role === "COURIER" &&
          (!oldCourierId || String(principal.userId) === oldCourierId)
        ) {
          await leaveRoom(socket, room);
          socket.emit(
            "room:evicted",
            realtimeEvictionSchema.parse({ reason: "reassigned" }),
          );
        }
      }
      return { handled: true, stale: false } as const;
    }
    if (event.type !== "parcel.status.changed")
      return { handled: true, stale: false } as const;

    const town = event.data.town;
    if (!town) {
      const reload = realtimeReloadSchema.parse({
        reason: "gap",
        sequence: event.sequence,
      });
      io.to(publicRoom(event.data.trackingNo)).emit("parcel:reload", reload);
      io.to(privateRoom(event.data.parcelId)).emit("parcel:reload", reload);
      input.logger.warn(
        { eventId: event.eventId, eventType: event.type },
        "Realtime status event has no public town projection",
      );
      return { handled: true, stale: false } as const;
    }
    const publicUpdate = publicRealtimeUpdateSchema.parse({
      status: event.data.to,
      occurredAt: event.data.occurredAt || event.occurredAt,
      town,
      sequence: event.sequence,
    });
    const privateUpdate = privateRealtimeUpdateSchema.parse({
      ...publicUpdate,
      parcelId: event.data.parcelId,
      trackingNumber: event.data.trackingNo,
    });
    io.to(publicRoom(event.data.trackingNo)).emit(
      "parcel:status",
      publicUpdate,
    );
    io.to(privateRoom(event.data.parcelId)).emit(
      "parcel:status",
      privateUpdate,
    );
    return { handled: true, stale: false } as const;
  }

  return {
    io,
    publish,
    async close() {
      for (const socketId of localSessions.keys()) clearLocalSession(socketId);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      publisher?.disconnect();
      subscriber?.disconnect();
    },
  };
}
