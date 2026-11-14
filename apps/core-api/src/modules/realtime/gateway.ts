import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import {
  isSwiftDropEvent,
  parcelJoinSchema,
  publicTrackingSchema,
  REALTIME_EVENTS,
  trackingNumberSchema,
  type Role,
} from "@swiftdrop/contracts";
import type { z } from "zod";
import { HttpError } from "../../shared/problem.js";
import type { PrivateAccess, RealtimeUser } from "./access.js";
import { privateRoom, project, publicRoom, userRoom } from "./projection.js";

type Ack = (response: unknown) => void;
const MAX_ROOMS_PER_SOCKET = 20;
const MAX_JOINS_PER_MINUTE = 30;

/** Each join costs a database lookup, so a single socket may not hammer them. */
function allowJoin(socket: Socket) {
  const now = Date.now();
  const recent = ((socket.data.joins as number[] | undefined) ?? []).filter(
    (at) => now - at < 60_000,
  );
  if (recent.length >= MAX_JOINS_PER_MINUTE) {
    socket.data.joins = recent;
    return false;
  }
  socket.data.joins = [...recent, now];
  return true;
}

export interface TokenReader {
  authenticate(
    header: string | undefined,
  ): Promise<{ user: { id: number; role: Role } }>;
}

/** Expiry of an already-verified access token (verification happened in `authenticate`). */
export function tokenExpiry(token: string): number | null {
  try {
    const exp = (
      JSON.parse(
        Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
      ) as {
        exp?: unknown;
      }
    ).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Socket.IO gateway (FR-I6). Public rooms need no login and carry only the public projection;
 * private rooms re-check authorisation in the database at every join, are left when a token
 * expires, and are revoked cluster-wide when a courier is reassigned. The Redis adapter lets
 * any replica emit to sockets connected to any other replica.
 */
export function createRealtimeGateway(options: {
  httpServer: HttpServer;
  origin: string;
  /** Omit for a single process (tests); production passes Redis so replicas share rooms. */
  redis?: Redis;
  auth: TokenReader;
  access: PrivateAccess;
  track: (
    trackingNumber: string,
  ) => Promise<z.infer<typeof publicTrackingSchema>>;
  logger: Logger;
}) {
  const { auth, access, track, logger } = options;
  const io = new Server(options.httpServer, {
    cors: { origin: options.origin },
    serveClient: false,
    maxHttpBufferSize: 10_000,
  });
  const clients = options.redis
    ? [options.redis.duplicate(), options.redis.duplicate()]
    : [];
  for (const client of clients)
    client.on("error", () => {
      /* adapter errors surface as missing cross-replica delivery, not a crash */
    });
  if (clients[0] && clients[1])
    io.adapter(createAdapter(clients[0], clients[1]));

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (token === undefined) return next(); // public tracking only
    if (typeof token !== "string" || token.length > 4096)
      return next(new Error("UNAUTHENTICATED"));
    try {
      const { user } = await auth.authenticate(`Bearer ${token}`);
      socket.data.user = {
        id: user.id,
        role: user.role,
      } satisfies RealtimeUser;
      socket.data.expiresAt = tokenExpiry(token);
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  const reply = (ack: unknown, response: unknown) => {
    if (typeof ack === "function") (ack as Ack)(response);
  };
  const failure = (error: string) => ({ ok: false, error });
  const roomCount = (socket: Socket) =>
    [...socket.rooms].filter(
      (room) => room !== socket.id && !room.startsWith("user:"),
    ).length;

  io.on("connection", (socket) => {
    const user = socket.data.user as RealtimeUser | undefined;
    if (user) {
      void socket.join(userRoom(user.id));
      const expiresAt = socket.data.expiresAt as number | null;
      if (expiresAt) {
        const timer = setTimeout(
          () => {
            for (const room of socket.rooms)
              if (room.startsWith("private:") || room.startsWith("user:"))
                void socket.leave(room);
            socket.emit(REALTIME_EVENTS.authExpired);
            socket.disconnect(true);
          },
          Math.max(0, expiresAt - Date.now()),
        );
        timer.unref();
        socket.once("disconnect", () => clearTimeout(timer));
      }
    }

    socket.on(
      REALTIME_EVENTS.trackJoin,
      async (payload: unknown, ack: unknown) => {
        const number = trackingNumberSchema.safeParse(
          (payload as { trackingNumber?: unknown } | null)?.trackingNumber,
        );
        if (!number.success) return reply(ack, failure("INVALID"));
        if (!allowJoin(socket)) return reply(ack, failure("RATE_LIMITED"));
        if (roomCount(socket) >= MAX_ROOMS_PER_SOCKET)
          return reply(ack, failure("TOO_MANY_ROOMS"));
        try {
          const snapshot = await track(number.data);
          await socket.join(publicRoom(number.data));
          reply(ack, { ok: true, snapshot });
        } catch (error) {
          if (error instanceof HttpError && error.status === 404)
            return reply(ack, failure("NOT_FOUND"));
          logger.warn({ event: "realtime_join_failed" });
          reply(ack, failure("UNAVAILABLE"));
        }
      },
    );

    socket.on(
      REALTIME_EVENTS.parcelJoin,
      async (payload: unknown, ack: unknown) => {
        if (!user) return reply(ack, failure("UNAUTHENTICATED"));
        const parsed = parcelJoinSchema.safeParse(payload);
        if (!parsed.success) return reply(ack, failure("INVALID"));
        if (!allowJoin(socket)) return reply(ack, failure("RATE_LIMITED"));
        if (roomCount(socket) >= MAX_ROOMS_PER_SOCKET)
          return reply(ack, failure("TOO_MANY_ROOMS"));
        try {
          const snapshot = await access.snapshotFor(user, parsed.data.parcelId);
          if (!snapshot) return reply(ack, failure("NOT_FOUND"));
          await socket.join(privateRoom(parsed.data.parcelId));
          reply(ack, { ok: true, snapshot });
        } catch {
          logger.warn({ event: "realtime_join_failed" });
          reply(ack, failure("UNAVAILABLE"));
        }
      },
    );

    socket.on(
      REALTIME_EVENTS.parcelLeave,
      async (payload: unknown, ack: unknown) => {
        const parsed = parcelJoinSchema.safeParse(payload);
        if (parsed.success)
          await socket.leave(privateRoom(parsed.data.parcelId));
        reply(ack, { ok: parsed.success });
      },
    );
  });

  return {
    io,
    /** Handle one realtime.q message. Invalid messages are dropped: realtime is best effort. */
    async handle(content: Buffer) {
      let event: unknown;
      try {
        event = JSON.parse(content.toString("utf8"));
      } catch {
        return;
      }
      if (!isSwiftDropEvent(event)) return;
      const projection = project(event);
      if (projection.revoke)
        io.in(userRoom(projection.revoke.userId)).socketsLeave(
          projection.revoke.room,
        );
      for (const emit of projection.emits)
        io.to(emit.room).emit(emit.event, emit.payload);
    },
    async close() {
      await io.close();
      for (const client of clients) client.disconnect();
    },
  };
}
