import { z } from "zod";
import { parcelStatusSchema } from "./lifecycle";

export const dispatchQueueQuerySchema = z
  .object({
    pickupZoneId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type DispatchQueueQuery = z.infer<typeof dispatchQueueQuerySchema>;

export const dispatchQueueItemSchema = z.object({
  id: z.string().uuid(),
  trackingNumber: z.string().regex(/^SD[A-Z0-9]{8}$/),
  status: parcelStatusSchema,
  version: z.number().int().positive(),
  dispatchVersion: z.number().int().positive(),
  originZoneId: z.number().int().positive(),
  originTown: z.string(),
  destinationTown: z.string(),
  weightGrams: z.number().int().positive(),
  createdAt: z.string().datetime(),
});
export type DispatchQueueItem = z.infer<typeof dispatchQueueItemSchema>;

export const dispatchQueueSchema = z.object({
  items: z.array(dispatchQueueItemSchema).max(100),
});

export const courierAssignmentInputSchema = z
  .object({
    courierUserId: z.number().int().positive(),
    dispatchVersion: z.number().int().positive(),
  })
  .strict();
export type CourierAssignmentInput = z.infer<
  typeof courierAssignmentInputSchema
>;

export const courierAssignmentSchema = z.object({
  id: z.string().uuid(),
  parcelId: z.string().uuid(),
  courierUserId: z.number().int().positive(),
  dispatchVersion: z.number().int().positive(),
  status: z.enum(["ACTIVE", "RELEASED"]),
  assignedAt: z.string().datetime(),
  releasedAt: z.string().datetime().nullable(),
});

export const dispatchAssignmentRecordSchema = courierAssignmentSchema.extend({
  courierName: z.string(),
  parcel: dispatchQueueItemSchema,
});

export const dispatchAssignmentQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
    status: z.enum(["ACTIVE", "RELEASED"]).optional(),
    courierUserId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type DispatchAssignmentQuery = z.infer<
  typeof dispatchAssignmentQuerySchema
>;

export const dispatchAssignmentPageSchema = z.object({
  items: z.array(dispatchAssignmentRecordSchema).max(100),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const dispatchParcelAssignmentSchema = z.object({
  parcel: dispatchQueueItemSchema,
  assignment: dispatchAssignmentRecordSchema.nullable(),
});

export const courierCapacitySchema = z.object({
  courierUserId: z.number().int().positive(),
  fullName: z.string(),
  onDuty: z.boolean(),
  maxCapacity: z.number().int().positive(),
  currentWorkload: z.number().int().nonnegative(),
  availableCapacity: z.number().int().nonnegative(),
  utilizationPercent: z.number().min(0).max(100),
  assignments: z.array(courierAssignmentSchema).max(100),
});
export const courierCapacityPageSchema = z.object({
  items: z.array(courierCapacitySchema).max(100),
});
