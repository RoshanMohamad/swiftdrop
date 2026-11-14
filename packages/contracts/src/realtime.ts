import { z } from "zod";
import { parcelStatusSchema } from "./lifecycle.js";

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
  .object({ trackingNumber: z.string().regex(/^SD[A-Z0-9]{8}$/) })
  .strict();
export const parcelJoinSchema = z.object({ parcelId: z.uuid() }).strict();
