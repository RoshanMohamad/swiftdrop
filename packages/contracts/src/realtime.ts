import { z } from "zod";
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
  z.object({
    kind: z.literal("private"),
    parcelId: z.string().uuid(),
    lastSequence: z.number().int().nonnegative().optional(),
  }).strict(),
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
export type RealtimeReload = z.infer<typeof realtimeReloadSchema>;
export type RealtimeEviction = z.infer<typeof realtimeEvictionSchema>;
export type RealtimeJoinResult = z.infer<typeof realtimeJoinResultSchema>;

/** Socket.IO transport contract. Payloads are projections, never broker or Prisma records. */
export interface RealtimeServerToClientEvents {
  "parcel:status": (
    update: PublicRealtimeUpdate | PrivateRealtimeUpdate,
  ) => void;
  "parcel:reload": (reload: RealtimeReload) => void;
  "room:evicted": (eviction: RealtimeEviction) => void;
}

export interface RealtimeClientToServerEvents {
  "room:join": (
    request: unknown,
    acknowledge?: (result: RealtimeJoinResult) => void,
  ) => void;
}
