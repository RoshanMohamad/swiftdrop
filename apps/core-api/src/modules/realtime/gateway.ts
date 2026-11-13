import type { Server as HttpServer } from "node:http";
import { createHash } from "node:crypto";
import { decodeJwt } from "jose";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import {
  privateRealtimeUpdateSchema,
  publicRealtimeUpdateSchema,
  realtimeJoinSchema,
  trackingNumberSchema,
  type PublicUser,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";
import type { AuthService } from "../auth/index.js";
import {
  PrismaRealtimeAccessPolicy,
  type RealtimeAccessPolicy,
} from "./policy.js";

type RealtimeSocketData = {
  privateUser?: PublicUser;
  expiryTimer?: ReturnType<typeof setTimeout>;
};

const publicRoom = (trackingNumber: string) => `public:${trackingNumber}`;
const privateRoom = (parcelId: string) => `private:${parcelId}`;
const ADVANCE_SEQUENCE = `
  local current = tonumber(redis.call("GET", KEYS[1]) or "0")
  local candidate = tonumber(ARGV[1])
  if candidate <= current then return 0 end
  redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
  return 1
`;

export async function createRealtimeGateway(input: {
  server: HttpServer;
  db: Database;
  redis: Redis;
  auth: AuthService;
  origin: string;
  logger: Logger;
  policy?: RealtimeAccessPolicy;
  useRedisAdapter?: boolean;
  allowJoin?: (address: string) => Promise<boolean>;
}) {
  const publisher =
    input.useRedisAdapter === false ? undefined : input.redis.duplicate();
  const subscriber =
    input.useRedisAdapter === false ? undefined : input.redis.duplicate();
  const io = new Server(input.server, {
    path: "/socket.io",
    cors: { origin: input.origin, credentials: true },
    transports: ["polling", "websocket"],
  });
  if (publisher && subscriber) {
    let installed = false;
    const installAdapter = () => {
      if (
        !installed &&
        publisher.status === "ready" &&
        subscriber.status === "ready"
      ) {
        io.adapter(createAdapter(publisher, subscriber));
        installed = true;
      }
    };
    for (const client of [publisher, subscriber]) {
      client.on("ready", installAdapter);
      client.on("error", () => {
        input.logger.warn(
          { error: "REDIS_ADAPTER_UNAVAILABLE" },
          "Realtime Redis adapter unavailable",
        );
      });
    }
    installAdapter();
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

  async function leavePrivateRooms(
    socket: {
      rooms: Set<string>;
      leave(room: string): Promise<void> | void;
      data: RealtimeSocketData;
      emit(event: string, payload: unknown): unknown;
    },
    reason: "expired" | "reassigned",
  ) {
    for (const room of socket.rooms)
      if (room.startsWith("private:")) await socket.leave(room);
    socket.data.privateUser = undefined;
    socket.emit("room:evicted", { reason });
  }

  io.on("connection", (socket) => {
    socket.on(
      "room:join",
      async (
        raw: unknown,
        acknowledge?: (result: { ok: boolean; code?: string }) => void,
      ) => {
        try {
          if (!(await allowJoin(socket.handshake.address)))
            throw new Error("RATE_LIMITED");
          const request = realtimeJoinSchema.parse(raw);
          if (request.kind === "public") {
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
            const authenticated = await input.auth.authenticate(
              token ? `Bearer ${token}` : undefined,
            );
            if (
              !(await policy.canJoinPrivate(
                authenticated.user,
                request.parcelId,
              ))
            )
              throw new Error("NOT_FOUND");
            await socket.join(privateRoom(request.parcelId));
            socket.data.privateUser = authenticated.user;
            if (socket.data.expiryTimer) clearTimeout(socket.data.expiryTimer);
            const expiry = decodeJwt(token).exp;
            if (!expiry) throw new Error("UNAUTHENTICATED");
            socket.data.expiryTimer = setTimeout(
              () => {
                void leavePrivateRooms(socket, "expired");
              },
              Math.max(0, expiry * 1000 - Date.now()),
            );
            socket.data.expiryTimer.unref?.();
          }
          acknowledge?.({ ok: true });
        } catch (error) {
          const code =
            error instanceof Error &&
            ["RATE_LIMITED", "NOT_FOUND", "UNAUTHENTICATED"].includes(
              error.message,
            )
              ? error.message
              : "INVALID_ROOM";
          acknowledge?.({ ok: false, code });
        }
      },
    );
    socket.on("disconnect", () => {
      if (socket.data.expiryTimer) clearTimeout(socket.data.expiryTimer);
    });
  });

  return {
    io,
    async publish(event: SwiftDropEvent) {
      const sequenceKey = `realtime:sequence:${event.data.parcelId}`;
      const advanced = await input.redis.eval(
        ADVANCE_SEQUENCE,
        1,
        sequenceKey,
        String(event.sequence),
        "86400",
      );
      if (Number(advanced) !== 1) return;
      if (event.type === "parcel.assignment.changed") {
        const sockets = await io
          .in(privateRoom(event.data.parcelId))
          .fetchSockets();
        await Promise.all(
          sockets.map((socket) => leavePrivateRooms(socket, "reassigned")),
        );
        return;
      }
      if (event.type !== "parcel.status.changed") return;
      const occurredAt = event.data.occurredAt || event.occurredAt;
      const town = event.data.town;
      if (!town) {
        input.logger.warn(
          { eventId: event.eventId, eventType: event.type },
          "Realtime status event has no town",
        );
        return;
      }
      const publicUpdate = publicRealtimeUpdateSchema.parse({
        status: event.data.to,
        occurredAt,
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
    },
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      publisher?.disconnect();
      subscriber?.disconnect();
    },
  };
}
