import { z } from "zod";
import { parcelStatusSchema } from "./lifecycle.js";

/** Dispatch and courier capacity (M06, FR-D1..D3). */
export const dispatchStateSchema = z.enum(["unassigned", "assigned"]);
export type DispatchState = z.infer<typeof dispatchStateSchema>;

export const dispatchParcelSchema = z.object({
  id: z.uuid(),
  trackingNumber: z.string(),
  status: parcelStatusSchema,
  version: z.number().int().positive(),
  attemptCount: z.number().int().nonnegative(),
  originZoneId: z.number().int().positive(),
  originTown: z.string(),
  destinationTown: z.string(),
  courierId: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
});
export type DispatchParcel = z.infer<typeof dispatchParcelSchema>;
export const dispatchParcelPageSchema = z.object({
  items: z.array(dispatchParcelSchema).max(101),
  nextCursor: z.string().nullable(),
});
export type DispatchParcelPage = z.infer<typeof dispatchParcelPageSchema>;

export const courierSummarySchema = z.object({
  userId: z.number().int().positive(),
  fullName: z.string().nullable(),
  onDuty: z.boolean(),
  capacity: z.number().int().min(1).max(100),
  workload: z.number().int().nonnegative(),
  /** False when the courier has no capacity profile yet; they cannot receive parcels. */
  hasProfile: z.boolean(),
});
export type CourierSummary = z.infer<typeof courierSummarySchema>;
export const courierListSchema = z.object({
  items: z.array(courierSummarySchema).max(200),
});

export const assignParcelSchema = z
  .object({
    courierId: z.number().int().positive(),
    /** The parcel version the dispatcher saw; a mismatch returns 409 so they refresh. */
    version: z.number().int().positive(),
  })
  .strict();
export type AssignParcel = z.infer<typeof assignParcelSchema>;
export const assignResultSchema = z.object({
  parcelId: z.uuid(),
  courierId: z.number().int().positive(),
  version: z.number().int().positive(),
  /** False when the parcel already had this courier (idempotent no-op). */
  changed: z.boolean(),
});
export type AssignResult = z.infer<typeof assignResultSchema>;

export const courierProfileUpdateSchema = z
  .object({
    onDuty: z.boolean().optional(),
    capacity: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => value.onDuty !== undefined || value.capacity !== undefined,
    "Send onDuty or capacity.",
  );
export type CourierProfileUpdate = z.infer<typeof courierProfileUpdateSchema>;
