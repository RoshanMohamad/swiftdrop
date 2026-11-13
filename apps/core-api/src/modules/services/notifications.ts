import { Router, type RequestHandler } from "express";
import {
  isSwiftDropEvent,
  notificationEventIdSchema,
  notificationLookupResultSchema,
  ROUTING_KEYS,
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
        (event.eventType !== ROUTING_KEYS.PARCEL_CREATED &&
          event.eventType !== ROUTING_KEYS.PARCEL_STATUS_CHANGED) ||
        event.aggregateId !== claims.parcelId ||
        !isSwiftDropEvent(event.payload) ||
        event.payload.type !== event.eventType ||
        (event.payload.type !== ROUTING_KEYS.PARCEL_CREATED &&
          event.payload.type !== ROUTING_KEYS.PARCEL_STATUS_CHANGED)
      )
        throw new HttpError(
          404,
          "NOT_FOUND",
          "The requested notification event is unavailable.",
        );
      const payload = event.payload;
      if (
        payload.eventId !== event.eventId ||
        payload.type !== event.eventType ||
        payload.data.parcelId !== event.aggregateId ||
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
