import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type Database } from "@swiftdrop/db";
import type {
  bookingRequestSchema,
  quoteRequestSchema,
  quoteSchema,
  parcelSchema,
  publicTrackingSchema,
  zoneInputSchema,
  priceInputSchema,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import { outbox } from "../../shared/outbox/index.js";
import type { z } from "zod";

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
  constructor(private db: Database) {}

  async createQuote(userId: number, input: QuoteInput) {
    const [origin, destination] = await Promise.all([
      this.db.zone.findFirst({
        where: {
          district: { equals: input.originDistrict, mode: "insensitive" },
          active: true,
        },
      }),
      this.db.zone.findFirst({
        where: {
          district: { equals: input.destinationDistrict, mode: "insensitive" },
          active: true,
        },
      }),
    ]);
    if (!origin || !destination)
      throw new HttpError(
        422,
        "UNSERVED_AREA",
        "One or both districts are not currently served.",
      );
    if (origin.id === destination.id)
      throw new HttpError(
        422,
        "INVALID_ROUTE",
        "Choose different pickup and delivery districts.",
      );
    const now = new Date();
    const price = await this.db.priceVersion.findFirst({
      where: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        effectiveFrom: { lte: now },
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!price)
      throw new HttpError(
        422,
        "PRICE_UNAVAILABLE",
        "A price is not available for this route yet.",
      );
    const extraKg = Math.ceil(Math.max(0, input.weightGrams - 1000) / 1000);
    const feeCents = price.baseCents + price.perExtraKgCents * extraKg;
    if (!Number.isSafeInteger(feeCents) || feeCents > 2_147_483_647)
      throw new HttpError(
        503,
        "PRICE_UNAVAILABLE",
        "The current price configuration cannot be used. Please contact support.",
      );
    const expiresAt = new Date(now.getTime() + 15 * 60_000);
    const quote = await this.db.quote.create({
      data: {
        userId,
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        priceVersionId: price.id,
        weightGrams: input.weightGrams,
        lengthMm: input.lengthMm,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
        feeCents,
        expiresAt,
      },
    });
    return {
      ...input,
      id: quote.id,
      feeCents,
      currency: "LKR" as const,
      expiresAt: iso(expiresAt),
      originTown: origin.town,
      destinationTown: destination.town,
    } satisfies z.infer<typeof quoteSchema>;
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
          // Envelope per Design Doc §6.3; no recipient name, phone or address (NFR-4).
          await outbox.add(tx, {
            type: "parcel.created",
            aggregateId: parcelId,
            sequence: 1,
            occurredAt: now,
            data: {
              parcelId,
              trackingNo: tracking,
              merchantId: null,
              to: "CREATED",
              town: quote.originZone.town,
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
    return this.db.zone.findMany({
      orderBy: { district: "asc" },
      select: { id: true, district: true, town: true, active: true },
    });
  }
  async createZone(input: ZoneInput) {
    const duplicate = await this.db.zone.findFirst({
      where: { district: { equals: input.district, mode: "insensitive" } },
    });
    if (duplicate)
      throw new HttpError(
        409,
        "DISTRICT_EXISTS",
        "That district is already in the service list.",
      );
    return this.db.zone.create({
      data: input,
      select: { id: true, district: true, town: true, active: true },
    });
  }
  async updateZone(id: number, input: ZoneInput) {
    const exists = await this.db.zone.findUnique({ where: { id } });
    if (!exists)
      throw new HttpError(404, "ZONE_NOT_FOUND", "District not found.");
    if (exists.district !== input.district || exists.town !== input.town)
      throw new HttpError(
        409,
        "ZONE_REFERENCED",
        "District names and public towns are fixed after creation to preserve existing quotes and tracking history.",
      );
    return this.db.zone.update({
      where: { id },
      data: { active: input.active },
      select: { id: true, district: true, town: true, active: true },
    });
  }
  async deleteZone(id: number) {
    try {
      await this.db.zone.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        throw new HttpError(
          409,
          "ZONE_IN_USE",
          "This district is used by pricing or delivery records and cannot be deleted.",
        );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        throw new HttpError(404, "ZONE_NOT_FOUND", "District not found.");
      throw error;
    }
  }
  async prices() {
    return this.db.priceVersion.findMany({
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    });
  }
  async createPrice(input: PriceInput) {
    if (input.originZoneId === input.destinationZoneId)
      throw new HttpError(
        400,
        "INVALID_ROUTE",
        "Choose different pickup and delivery districts.",
      );
    const [origin, destination] = await Promise.all([
      this.db.zone.findUnique({ where: { id: input.originZoneId } }),
      this.db.zone.findUnique({ where: { id: input.destinationZoneId } }),
    ]);
    if (!origin?.active || !destination?.active)
      throw new HttpError(400, "ZONE_INACTIVE", "Choose two active districts.");
    if (new Date(input.effectiveFrom) <= new Date())
      throw new HttpError(
        400,
        "INVALID_EFFECTIVE_DATE",
        "New prices must take effect in the future.",
      );
    return this.db.priceVersion.create({
      data: { ...input, effectiveFrom: new Date(input.effectiveFrom) },
    });
  }
}
