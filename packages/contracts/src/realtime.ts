import { z } from "zod";
import { TRACKING_PATTERN } from "./tracking";
import { parcelStatusSchema } from "./lifecycle";

export const publicRealtimeUpdateSchema = z
  .object({
    status: parcelStatusSchema,
    occurredAt: z.string().datetime(),
    town: z.string().min(1).max(80),
    sequence: z.number().int().positive(),
  })
  .strict();

export const privateRealtimeUpdateSchema = publicRealtimeUpdateSchema
  .extend({
    parcelId: z.string().uuid(),
    trackingNumber: z.string().min(1).max(16),
  })
  .strict();

export const realtimeJoinSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("public"),
      trackingNumber: z.string().min(1).max(16),
      lastSequence: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("private"),
      parcelId: z.string().uuid(),
      lastSequence: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);

export const realtimeLeaveSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("public"),
      trackingNumber: z.string().min(1).max(16),
    })
    .strict(),
  z
    .object({
      kind: z.literal("private"),
      parcelId: z.string().uuid(),
    })
    .strict(),
]);

export const realtimeReloadSchema = z
  .object({
    reason: z.enum(["gap", "reconnect"]),
    sequence: z.number().int().positive(),
  })
  .strict();

export const realtimeEvictionSchema = z
  .object({ reason: z.enum(["expired", "reassigned", "revoked"]) })
  .strict();

export const realtimeJoinResultSchema = z
  .object({
    ok: z.boolean(),
    code: z
      .enum(["RATE_LIMITED", "NOT_FOUND", "UNAUTHENTICATED", "INVALID_ROOM"])
      .optional(),
  })
  .strict();

export type PublicRealtimeUpdate = z.infer<typeof publicRealtimeUpdateSchema>;
export type PrivateRealtimeUpdate = z.infer<typeof privateRealtimeUpdateSchema>;
export type RealtimeJoin = z.infer<typeof realtimeJoinSchema>;
export type RealtimeLeave = z.infer<typeof realtimeLeaveSchema>;
export type RealtimeReload = z.infer<typeof realtimeReloadSchema>;
export type RealtimeEviction = z.infer<typeof realtimeEvictionSchema>;
export type RealtimeJoinResult = z.infer<typeof realtimeJoinResultSchema>;

/** Socket.IO transport contract. Payloads are projections, never broker or Prisma records. */
export interface RealtimeServerToClientEvents {
  "parcel:assigned": (
    update: PrivateAssignedEvent | CourierAssignmentEvent,
  ) => void;
  "parcel:status": (
    update: PublicRealtimeUpdate | PrivateRealtimeUpdate,
  ) => void;
  "parcel:reload": (reload: RealtimeReload) => void;
  "room:evicted": (eviction: RealtimeEviction) => void;
}

export interface RealtimeClientToServerEvents {
  "track:join": (
    request: unknown,
    acknowledge?: (result: unknown) => void,
  ) => void;
  "parcel:join": (
    request: unknown,
    acknowledge?: (result: unknown) => void,
  ) => void;
  "parcel:leave": (
    request: unknown,
    acknowledge?: (result: unknown) => void,
  ) => void;
  "room:join": (
    request: unknown,
    acknowledge?: (result: RealtimeJoinResult) => void,
  ) => void;
  "room:leave": (request: RealtimeLeave) => void;
}

/**
 * Realtime contract (plan X-12, FR-I6). Two distinct projections so a public tracker can never
 * receive private data: public rooms carry status, time, town and sequence only.
 *
 * Client → server (acknowledged):
 *   `track:join`  { trackingNumber }          public room `public:<trackingNo>`, no login
 *   `parcel:join` { parcelId }                private room `private:<parcelId>`, needs a bearer token
 *   `parcel:leave`{ parcelId }
 * Server → client:
 *   `parcel:status`   public projection (public room) or private projection (private room)
 *   `parcel:assigned` private projection (private room) or courier projection (`user:<id>`)
 *   `auth:expired`    the access token expired; private rooms were left; reconnect with a new token
 */
export const REALTIME_EVENTS = {
  trackJoin: "track:join",
  parcelJoin: "parcel:join",
  parcelLeave: "parcel:leave",
  status: "parcel:status",
  assigned: "parcel:assigned",
  authExpired: "auth:expired",
} as const;

export const publicStatusEventSchema = z
  .object({
    trackingNumber: z.string(),
    status: parcelStatusSchema,
    town: z.string().nullable(),
    occurredAt: z.string().datetime(),
    sequence: z.number().int().positive(),
  })
  .strict();
export type PublicStatusEvent = z.infer<typeof publicStatusEventSchema>;

export const privateStatusEventSchema = publicStatusEventSchema
  .extend({ parcelId: z.uuid() })
  .strict();
export type PrivateStatusEvent = z.infer<typeof privateStatusEventSchema>;

/** Private room and staff view: that a courier was set, never who. */
export const privateAssignedEventSchema = z
  .object({
    parcelId: z.uuid(),
    trackingNumber: z.string(),
    occurredAt: z.string().datetime(),
    sequence: z.number().int().positive(),
  })
  .strict();
export type PrivateAssignedEvent = z.infer<typeof privateAssignedEventSchema>;

/** Sent only to the courier's own `user:<id>` room so their job list can refresh. */
export const courierAssignmentEventSchema = privateAssignedEventSchema
  .extend({ change: z.enum(["assigned", "unassigned"]) })
  .strict();
export type CourierAssignmentEvent = z.infer<
  typeof courierAssignmentEventSchema
>;

export const parcelSnapshotSchema = z
  .object({
    parcelId: z.uuid(),
    trackingNumber: z.string(),
    status: parcelStatusSchema,
    version: z.number().int().positive(),
    history: z
      .array(
        z.object({
          status: parcelStatusSchema,
          town: z.string(),
          createdAt: z.string().datetime(),
        }),
      )
      .max(100),
  })
  .strict();
export type ParcelSnapshot = z.infer<typeof parcelSnapshotSchema>;

export const trackJoinSchema = z
  .object({ trackingNumber: z.string().regex(TRACKING_PATTERN) })
  .strict();
export const parcelJoinSchema = z.object({ parcelId: z.uuid() }).strict();
