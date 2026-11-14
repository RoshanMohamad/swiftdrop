import { z } from "zod";
import { parcelStatusSchema } from "./lifecycle.js";
import { courierSummarySchema } from "./dispatch.js";

/** Courier delivery (M07, FR-K1..K3). */
export const failureReasons = [
  "RECIPIENT_ABSENT",
  "WRONG_ADDRESS",
  "REFUSED",
  "UNREACHABLE",
  "OTHER",
] as const;
export const failureReasonSchema = z.enum(failureReasons);
export type FailureReason = z.infer<typeof failureReasonSchema>;

/** Statuses a courier may set; cancellation is staff/customer only. */
export const courierStatusTargets = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
] as const;

export const operationKeySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{8,64}$/,
    "Operation key must be 8-64 letters, digits, - or _.",
  );

export const proofObjectKeyPattern =
  /^proofs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png)$/;
export const proofMaxBytes = 2 * 1024 * 1024;
export const proofContentTypes = ["image/jpeg", "image/png"] as const;

export const courierJobSchema = z.object({
  id: z.uuid(),
  trackingNumber: z.string(),
  status: parcelStatusSchema,
  version: z.number().int().positive(),
  attemptCount: z.number().int().nonnegative(),
  originTown: z.string(),
  destinationTown: z.string(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  recipientAddress: z.string(),
  assignedAt: z.string().datetime(),
});
export type CourierJob = z.infer<typeof courierJobSchema>;
export const courierJobsSchema = z.object({
  items: z.array(courierJobSchema).max(200),
  profile: courierSummarySchema,
});
export type CourierJobs = z.infer<typeof courierJobsSchema>;

export const courierStatusUpdateSchema = z
  .object({
    to: z.enum(courierStatusTargets),
    town: z.string().trim().min(1).max(80),
    version: z.number().int().positive(),
    /** Required for DELIVERED: who received the parcel. */
    receivedBy: z
      .string()
      .trim()
      .min(2, "Enter the name of the person who received the parcel.")
      .max(120)
      .regex(/^[^\p{Cc}]+$/u, "Remove control characters.")
      .optional(),
    /** Required for FAILED, from a fixed list. */
    failureReason: failureReasonSchema.optional(),
    /** Optional private photo uploaded first via the proof endpoint. */
    proofObjectKey: z.string().regex(proofObjectKeyPattern).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.to === "DELIVERED" && !value.receivedBy)
      ctx.addIssue({
        code: "custom",
        path: ["receivedBy"],
        message: "Enter the name of the person who received the parcel.",
      });
    if (value.to === "FAILED" && !value.failureReason)
      ctx.addIssue({
        code: "custom",
        path: ["failureReason"],
        message: "Choose why the delivery failed.",
      });
    if (value.to !== "DELIVERED" && (value.receivedBy || value.proofObjectKey))
      ctx.addIssue({
        code: "custom",
        path: ["receivedBy"],
        message: "Proof of delivery applies only to DELIVERED.",
      });
    if (value.to !== "FAILED" && value.failureReason)
      ctx.addIssue({
        code: "custom",
        path: ["failureReason"],
        message: "A failure reason applies only to FAILED.",
      });
  });
export type CourierStatusUpdate = z.infer<typeof courierStatusUpdateSchema>;
export const courierStatusResultSchema = z.object({
  status: parcelStatusSchema,
  version: z.number().int().positive(),
  attemptCount: z.number().int().nonnegative(),
  /** True when this operation key had already been applied and the original result is returned. */
  replayed: z.boolean(),
});
export type CourierStatusResult = z.infer<typeof courierStatusResultSchema>;

export const courierDutySchema = z.object({ onDuty: z.boolean() }).strict();
export type CourierDuty = z.infer<typeof courierDutySchema>;

export const proofUploadResultSchema = z.object({
  proofObjectKey: z.string().regex(proofObjectKeyPattern),
});
export type ProofUploadResult = z.infer<typeof proofUploadResultSchema>;
