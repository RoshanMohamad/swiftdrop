import { z } from "zod";

/**
 * Event envelope shared by every producer (via `outbox.add`) and every consumer
 * (realtime, notifications, webhooks). Design Doc §6.3. Owned by M08 (transport) in
 * agreement with M09 (event-specific payloads, `events*`).
 */
export const EVENT_ENVELOPE_VERSION = 1;

export const eventTypeSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
    "Event types are dot-separated lower-case words.",
  );

// Events never carry contact data, photos or free text (NFR-4). Reject by key name so a
// producer cannot add such a field by accident; consumers look it up with service JWTs.
const forbiddenKey =
  /name|phone|address|email|photo|note|password|secret|token/i;
export function findForbiddenKeys(value: unknown, path = "data"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      findForbiddenKeys(item, `${path}[${index}]`),
    );
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbiddenKey.test(key) ? [`${path}.${key}`] : []),
    ...findForbiddenKeys(child, `${path}.${key}`),
  ]);
}

export const eventEnvelopeSchema = z
  .object({
    eventId: z.uuid(),
    type: eventTypeSchema,
    version: z.literal(EVENT_ENVELOPE_VERSION),
    occurredAt: z.string().datetime(),
    sequence: z.number().int().min(1),
    data: z
      .record(z.string(), z.unknown())
      .refine(
        (data) => findForbiddenKeys(data).length === 0,
        "Event data must not contain contact data, photos or free text.",
      ),
  })
  .strict();
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/** Fields every `parcel.*` event carries; extra type-specific fields are allowed. */
export const parcelEventDataSchema = z
  .object({
    parcelId: z.uuid(),
    trackingNo: z.string().min(1).max(32),
    merchantId: z.number().int().positive().nullable().optional(),
  })
  .loose();

/** Admin replay request travelling through the outbox to webhooks.q (not a parcel event). */
export const WEBHOOK_REPLAY_EVENT = "webhook.replay.requested";
export const webhookReplayDataSchema = z
  .object({
    deliveryId: z.uuid(),
    runNumber: z.number().int().min(1),
  })
  .strict();

// ---- Admin delivery log and replay API (FR-I5, FR-F5 replay page) ----
export const webhookDeliveryStatusSchema = z.enum([
  "PENDING",
  "SUCCESS",
  "FAILED",
  "SKIPPED",
]);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const webhookAttemptSchema = z.object({
  runNumber: z.number().int().min(0),
  attempt: z.number().int().min(0).max(6),
  outcome: z.enum(["SUCCESS", "FAILURE", "SKIPPED"]).nullable(),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  nextRetryAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime(),
});

export const webhookDeliverySchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventType: z.string(),
  merchantId: z.number().int().positive(),
  status: webhookDeliveryStatusSchema,
  currentRun: z.number().int().min(0),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const webhookDeliveryPageSchema = z.object({
  items: z.array(webhookDeliverySchema).max(101),
  nextCursor: z.string().nullable(),
});
export const webhookReplaySchema = z.object({
  runNumber: z.number().int().min(1),
  requestedByUserId: z.number().int().positive(),
  reason: z.string(),
  createdAt: z.string().datetime(),
});
export const webhookDeliveryDetailSchema = webhookDeliverySchema.extend({
  attempts: z.array(webhookAttemptSchema),
  replays: z.array(webhookReplaySchema),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
export type WebhookDeliveryDetail = z.infer<typeof webhookDeliveryDetailSchema>;

export const webhookReplayRequestSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3, "Give a short reason for the audit record.")
      .max(200)
      .regex(/^[^\p{Cc}]+$/u, "Remove control characters."),
  })
  .strict();
export type WebhookReplayRequest = z.infer<typeof webhookReplayRequestSchema>;
export const webhookReplayResultSchema = z.object({
  deliveryId: z.uuid(),
  runNumber: z.number().int().min(1),
  status: z.literal("PENDING"),
});
