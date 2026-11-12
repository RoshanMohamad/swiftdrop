import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type Database } from "@swiftdrop/db";
import type {
  bookingRequestSchema,
  ParcelCreatedEvent,
  quoteRequestSchema,
  parcelSchema,
  publicTrackingSchema,
  zoneInputSchema,
  priceInputSchema,
} from "@swiftdrop/contracts";
import { ROUTING_KEYS } from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import type { z } from "zod";
import { PricingService } from "../pricing/index.js";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const requestHash = (body: unknown) =>
  createHash("sha256").update(JSON.stringify(body)).digest("hex");
const iso = (date: Date) => date.toISOString();
const trackingNumber = () => {
  const seed = randomBytes(7).toString("hex").toUpperCase().slice(0, 7);
  const check =
    [...seed].reduce((sum, ch) => sum + ALPHABET.indexOf(ch), 0) %
    ALPHABET.length;
  return `SD${seed}${ALPHABET[check]}`;
};
const publicParcel = (
  parcel: Prisma.ParcelGetPayload<{ include: typeof parcelInclude }>,
) => ({
  id: parcel.id,
  trackingNumber: parcel.trackingNumber,
  status: parcel.status,
  feeCents: parcel.feeCents,
  currency: "LKR" as const,
  weightGrams: parcel.quote.weightGrams,
  lengthMm: parcel.quote.lengthMm,
  widthMm: parcel.quote.widthMm,
  heightMm: parcel.quote.heightMm,
  originTown: parcel.originZone.town,
  destinationTown: parcel.destinationZone.town,
  recipientName: parcel.recipientName,
  recipientPhone: parcel.recipientPhone,
  recipientAddress: parcel.recipientAddress,
  createdAt: iso(parcel.createdAt),
  history: parcel.history.slice(0, 100).map((item) => ({
    status: item.status,
    town: item.town,
    createdAt: iso(item.createdAt),
  })),
});
const parcelInclude = {
  originZone: { select: { town: true } },
  destinationZone: { select: { town: true } },
  quote: {
    select: {
      weightGrams: true,
      lengthMm: true,
      widthMm: true,
      heightMm: true,
    },
  },
  history: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    take: 100,
  },
};

type QuoteInput = z.infer<typeof quoteRequestSchema>;
type BookingInput = z.infer<typeof bookingRequestSchema>;
type ZoneInput = z.infer<typeof zoneInputSchema>;
type PriceInput = z.infer<typeof priceInputSchema>;

export class ParcelService {
  private pricing: PricingService;

  constructor(
    private db: Database,
    pricing?: PricingService,
  ) {
    this.pricing = pricing ?? new PricingService(db);
  }

  async createQuote(userId: number, input: QuoteInput) {
    return this.pricing.createQuote(userId, input);
  }

  async book(userId: number, idempotencyKey: string, input: BookingInput) {
    if (!/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey))
      throw new HttpError(
        400,
        "IDEMPOTENCY_KEY",
        "Send a valid Idempotency-Key header.",
      );
    const principalKey = `user:${userId}`;
    const hash = requestHash(input);
    const operation = "parcel.create.v1";
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${principalKey + operation + idempotencyKey}, 0))`;
          const now = new Date();
          await tx.idempotencyRecord.deleteMany({
            where: {
              principalKey,
              operation,
              key: idempotencyKey,
              expiresAt: { lte: now },
            },
          });
          const previous = await tx.idempotencyRecord.findUnique({
            where: {
              principalKey_operation_key: {
                principalKey,
                operation,
                key: idempotencyKey,
              },
            },
          });
          if (previous) {
            if (previous.requestHash !== hash)
              throw new HttpError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "This request key was already used with different booking details.",
              );
            return previous.response as z.infer<typeof parcelSchema>;
          }
          await tx.$queryRaw`SELECT id FROM quotes WHERE id = ${input.quoteId}::uuid FOR UPDATE`;
          const quote = await tx.quote.findUnique({
            where: { id: input.quoteId },
            include: { originZone: true, destinationZone: true },
          });
          if (!quote || quote.userId !== userId)
            throw new HttpError(
              404,
              "QUOTE_NOT_FOUND",
              "This quote is not available.",
            );
          if (quote.expiresAt <= now)
            throw new HttpError(
              410,
              "QUOTE_EXPIRED",
              "This quote has expired. Get a new quote before booking.",
            );
          if (quote.consumedAt)
            throw new HttpError(
              409,
              "QUOTE_USED",
              "This quote has already been used.",
            );
          const parcelId = randomUUID();
          let tracking = "";
          for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = trackingNumber();
            if (
              !(await tx.parcel.findUnique({
                where: { trackingNumber: candidate },
                select: { id: true },
              }))
            ) {
              tracking = candidate;
              break;
            }
          }
          if (!tracking)
            throw new HttpError(
              503,
              "TRACKING_UNAVAILABLE",
              "A tracking number could not be reserved. Retry with the same key.",
            );
          await tx.quote.update({
            where: { id: quote.id },
            data: { consumedAt: now },
          });
          await tx.parcel.create({
            data: {
              id: parcelId,
              trackingNumber: tracking,
              userId,
              quoteId: quote.id,
              originZoneId: quote.originZoneId,
              destinationZoneId: quote.destinationZoneId,
              feeCents: quote.feeCents,
              recipientName: input.recipientName,
              recipientPhone: input.recipientPhone,
              recipientAddress: input.recipientAddress,
              history: {
                create: {
                  status: "CREATED",
                  town: quote.originZone.town,
                  createdAt: now,
                },
              },
            },
          });
          const parcel = await tx.parcel.findUniqueOrThrow({
            where: { id: parcelId },
            include: parcelInclude,
          });
          const response = publicParcel(parcel);
          const eventId = randomUUID();
          const occurredAt = now.toISOString();
          const event = {
            eventId,
            type: ROUTING_KEYS.PARCEL_CREATED,
            version: 1,
            occurredAt,
            sequence: 1,
            data: {
              parcelId,
              trackingNo: tracking,
              customerId: String(userId),
              originZone: quote.originZone.town,
              destZone: quote.destinationZone.town,
              feeCents: quote.feeCents,
              // Bookings are immediate until the parcel model gains a persisted schedule.
              scheduledDate: occurredAt,
            },
          } satisfies ParcelCreatedEvent;
          await tx.outboxEvent.create({
            data: {
              eventId,
              eventType: event.type,
              aggregateId: parcelId,
              payload: event,
            },
          });
          await tx.idempotencyRecord.create({
            data: {
              principalKey,
              operation,
              key: idempotencyKey,
              requestHash: hash,
              response,
              expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
            },
          });
          return response;
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new HttpError(
          409,
          "BOOKING_BUSY",
          "This booking changed at the same time. Retry with the same key.",
        );
      throw error;
    }
  }

  async list(userId: number, cursor?: string) {
    const after = cursor
      ? await this.db.parcel.findFirst({
          where: { id: cursor, userId },
          select: { id: true, createdAt: true },
        })
      : null;
    if (cursor && !after)
      throw new HttpError(
        400,
        "INVALID_CURSOR",
        "The booking page cursor is invalid.",
      );
    const rows = await this.db.parcel.findMany({
      where: {
        userId,
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      include: parcelInclude,
    });
    const page = rows.slice(0, 20);
    return {
      items: page.map(publicParcel),
      nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null,
    };
  }

  async detail(userId: number, id: string) {
    const parcel = await this.db.parcel.findFirst({
      where: { id, userId },
      include: parcelInclude,
    });
    if (!parcel)
      throw new HttpError(
        404,
        "PARCEL_NOT_FOUND",
        "This booking is not available.",
      );
    return publicParcel(parcel);
  }

  async track(number: string) {
    const parcel = await this.db.parcel.findUnique({
      where: { trackingNumber: number },
      include: parcelInclude,
    });
    if (!parcel)
      throw new HttpError(
        404,
        "TRACKING_NOT_FOUND",
        "No delivery was found for that tracking number.",
      );
    return {
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      originTown: parcel.originZone.town,
      destinationTown: parcel.destinationZone.town,
      history: parcel.history.slice(0, 100).map((item) => ({
        status: item.status,
        town: item.town,
        createdAt: iso(item.createdAt),
      })),
    } satisfies z.infer<typeof publicTrackingSchema>;
  }

  async zones() {
    return this.pricing.listZones();
  }
  async createZone(input: ZoneInput) {
    return this.pricing.createZone(input);
  }
  async updateZone(id: number, input: ZoneInput) {
    return this.pricing.updateZone(id, input);
  }
  async deleteZone(id: number) {
    return this.pricing.deleteZone(id);
  }
  async prices() {
    return this.pricing.listPrices();
  }
  async createPrice(input: PriceInput) {
    return this.pricing.createPrice(input);
  }
}
