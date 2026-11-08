import { Router, type RequestHandler } from "express";
import {
  notificationEventIdSchema,
  notificationLookupResultSchema,
} from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";
import { HttpError } from "../../shared/problem.js";

type ServiceRequest = RequestHandler & {};

export function createNotificationLookupRouter(
  db: Database,
  authenticate: ServiceRequest,
) {
  const router = Router();
  router.get("/events/:eventId", authenticate, async (req, res, next) => {
    try {
      const eventId = notificationEventIdSchema.parse(req.params.eventId);
      const claims = res.locals.service as
        { eventId: string; parcelId: string } | undefined;
      if (!claims || claims.eventId !== eventId)
        throw new HttpError(
          404,
          "NOT_FOUND",
          "The requested notification event is unavailable.",
        );
      const event = await db.outboxEvent.findUnique({ where: { eventId } });
      if (
        !event ||
        event.eventType !== "parcel.created" ||
        event.aggregateId !== claims.parcelId ||
        typeof event.payload !== "object" ||
        event.payload === null ||
        Array.isArray(event.payload)
      )
        throw new HttpError(
          404,
          "NOT_FOUND",
          "The requested notification event is unavailable.",
        );
      const payload = event.payload as Record<string, unknown>;
      if (
        payload.eventId !== event.eventId ||
        payload.eventType !== "parcel.created" ||
        payload.parcelId !== event.aggregateId ||
        claims.parcelId !== event.aggregateId
      ) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "The requested notification event is unavailable.",
        );
      }
      const parcel = await db.parcel.findUnique({
        where: { id: event.aggregateId },
        select: {
          id: true,
          trackingNumber: true,
          recipientName: true,
          recipientPhone: true,
          user: { select: { email: true } },
        },
      });
      if (!parcel)
        throw new HttpError(
          404,
          "NOT_FOUND",
          "The requested notification event is unavailable.",
        );
      res.json(
        notificationLookupResultSchema.parse({
          eventId: event.eventId,
          parcelId: parcel.id,
          trackingNumber: parcel.trackingNumber,
          customerEmail: parcel.user.email,
          recipientName: parcel.recipientName,
          recipientPhone: parcel.recipientPhone,
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "This route does not exist.")),
  );
  return router;
}
