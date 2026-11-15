import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { isSwiftDropEvent, ROUTING_KEYS } from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";
import { HttpError } from "../../shared/problem.js";

export type WebhookTargetLookup = (
  merchantId: string,
) => Promise<{ url: string; secret: string } | null>;

// Only merchant-facing events are delivered by webhook-svc.
const LOOKUP_TYPES: readonly string[] = [
  ROUTING_KEYS.PARCEL_CREATED,
  ROUTING_KEYS.PARCEL_STATUS_CHANGED,
];

const paramsSchema = z.object({ merchantId: z.uuid() });
const querySchema = z.object({ eventId: z.uuid() }).strict();

const unavailable = () =>
  new HttpError(
    404,
    "NOT_FOUND",
    "The requested webhook configuration is unavailable.",
  );

/**
 * X-11: webhook-svc reads one merchant's URL and signing secret. Event-bound like the
 * notification lookup: the service token names the persisted event and parcel, and the merchant
 * in the path must be the merchant that event belongs to, so a worker cannot enumerate secrets.
 * Unconfigured, unapproved and suspended merchants all return the same 404.
 */
export function createWebhookConfigRouter(
  db: Database,
  authenticate: RequestHandler,
  targetFor: WebhookTargetLookup,
) {
  const router = Router();
  router.get(
    "/merchants/:merchantId/config",
    authenticate,
    async (req, res, next) => {
      try {
        const params = paramsSchema.safeParse(req.params);
        const query = querySchema.safeParse(req.query);
        if (!params.success || !query.success)
          throw new HttpError(400, "VALIDATION", "The request is invalid.");
        const claims = res.locals.service as
          { eventId: string; parcelId: string } | undefined;
        if (!claims || claims.eventId !== query.data.eventId)
          throw unavailable();
        const event = await db.outboxEvent.findUnique({
          where: { eventId: query.data.eventId },
        });
        if (
          !event ||
          !LOOKUP_TYPES.includes(event.eventType) ||
          event.aggregateId !== claims.parcelId ||
          !isSwiftDropEvent(event.payload) ||
          event.payload.type !== event.eventType ||
          event.payload.eventId !== event.eventId ||
          event.payload.data.parcelId !== claims.parcelId ||
          (event.payload.data as { merchantId?: string }).merchantId !==
            params.data.merchantId
        )
          throw unavailable();
        const target = await targetFor(params.data.merchantId);
        if (!target) throw unavailable();
        res.json({ url: target.url, secret: target.secret });
      } catch (error) {
        next(error);
      }
    },
  );
  router.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "This route does not exist.")),
  );
  return router;
}
