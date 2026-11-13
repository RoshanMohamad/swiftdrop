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
    })
    .strict(),
  z
    .object({ kind: z.literal("private"), parcelId: z.string().uuid() })
    .strict(),
]);

export type PublicRealtimeUpdate = z.infer<typeof publicRealtimeUpdateSchema>;
export type PrivateRealtimeUpdate = z.infer<typeof privateRealtimeUpdateSchema>;
export type RealtimeJoin = z.infer<typeof realtimeJoinSchema>;
