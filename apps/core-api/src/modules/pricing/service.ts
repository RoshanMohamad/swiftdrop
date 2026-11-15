import { Prisma, type Database } from "@swiftdrop/db";
import type {
  quoteRequestSchema,
  quoteSchema,
  zoneInputSchema,
  priceInputSchema,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import type { z } from "zod";
import { PricingStrategyFactory, type PricingStrategy } from "./strategy.js";

const iso = (date: Date) => date.toISOString();

export type QuoteInput = z.infer<typeof quoteRequestSchema>;
export type ZoneInput = z.infer<typeof zoneInputSchema>;
export type PriceInput = z.infer<typeof priceInputSchema>;

export class PricingService {
  constructor(
    private db: Database,
    private strategy: PricingStrategy = PricingStrategyFactory.getStrategy(
      "STANDARD",
    ),
  ) {}

  /**
   * Sets or swaps the pricing strategy (Design Pattern: Strategy Pattern).
   */
  setStrategy(strategy: PricingStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Returns the current pricing strategy.
   */
  getStrategy(): PricingStrategy {
    return this.strategy;
  }

  /**
   * Generates a 15-minute quote for delivery between two active districts.
   * Conforms to FR-P2.
   */
  private async priceRoute(input: QuoteInput) {
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
    if (!origin || !destination) {
      throw new HttpError(
        422,
        "UNSERVED_AREA",
        "One or both districts are not currently served.",
      );
    }
    if (origin.id === destination.id) {
      throw new HttpError(
        422,
        "INVALID_ROUTE",
        "Choose different pickup and delivery districts.",
      );
    }

    const now = new Date();
    const price = await this.db.priceVersion.findFirst({
      where: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        effectiveFrom: { lte: now },
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!price) {
      throw new HttpError(
        422,
        "PRICE_UNAVAILABLE",
        "A price is not available for this route yet.",
      );
    }

    // Calculate fee using the PricingStrategy (Strategy Pattern)
    const feeCents = this.strategy.calculate(
      {
        weightGrams: input.weightGrams,
        lengthMm: input.lengthMm,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
      },
      price,
    );

    return { origin, destination, price, feeCents, now };
  }

  /**
   * Read-only fee estimate: same route lookup and strategy as createQuote, but nothing is stored.
   * Backs GET /quotes/estimate so the AI assistant can quote through the REST API (claude.md).
   */
  async estimate(input: QuoteInput) {
    const { origin, destination, feeCents } = await this.priceRoute(input);
    return {
      ...input,
      feeCents,
      currency: "LKR" as const,
      originTown: origin.town,
      destinationTown: destination.town,
    };
  }

  /**
   * Generates a 15-minute quote for delivery between two active districts.
   * Conforms to FR-P2.
   */
  async createQuote(userId: number, input: QuoteInput) {
    const { origin, destination, price, feeCents, now } =
      await this.priceRoute(input);
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

  /**
   * Retrieves a quote by ID.
   */
  async getQuote(quoteId: string) {
    const quote = await this.db.quote.findUnique({
      where: { id: quoteId },
      include: {
        originZone: true,
        destinationZone: true,
        priceVersion: true,
      },
    });
    if (!quote) {
      throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
    }
    return quote;
  }

  /**
   * Integration Contract X-04 (M03 -> M04):
   * Validates that a quote exists, belongs to the user, is not expired, and has not yet been consumed.
   */
  async validateQuoteForBooking(quoteId: string, userId: number) {
    const quote = await this.db.quote.findUnique({
      where: { id: quoteId },
      include: {
        originZone: true,
        destinationZone: true,
      },
    });
    if (!quote || quote.userId !== userId) {
      throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
    }
    if (quote.consumedAt !== null) {
      throw new HttpError(
        409,
        "QUOTE_CONSUMED",
        "This quote has already been booked.",
      );
    }
    if (new Date(quote.expiresAt) <= new Date()) {
      throw new HttpError(
        410,
        "QUOTE_EXPIRED",
        "This quote has expired. Please calculate a new quote.",
      );
    }
    return quote;
  }

  /**
   * Lists all zones, ordered by district.
   */
  async listZones() {
    return this.db.zone.findMany({
      orderBy: { district: "asc" },
      select: { id: true, district: true, town: true, active: true },
    });
  }

  /**
   * Creates a new zone.
   */
  async createZone(input: ZoneInput) {
    const duplicate = await this.db.zone.findFirst({
      where: { district: { equals: input.district, mode: "insensitive" } },
    });
    if (duplicate) {
      throw new HttpError(
        409,
        "DISTRICT_EXISTS",
        "That district is already in the service list.",
      );
    }
    return this.db.zone.create({
      data: input,
      select: { id: true, district: true, town: true, active: true },
    });
  }

  /**
   * Updates an existing zone (active flag toggle).
   */
  async updateZone(id: number, input: ZoneInput) {
    const exists = await this.db.zone.findUnique({ where: { id } });
    if (!exists) {
      throw new HttpError(404, "ZONE_NOT_FOUND", "District not found.");
    }
    if (exists.district !== input.district || exists.town !== input.town) {
      throw new HttpError(
        409,
        "ZONE_REFERENCED",
        "District names and public towns are fixed after creation to preserve existing quotes and tracking history.",
      );
    }
    return this.db.zone.update({
      where: { id },
      data: { active: input.active },
      select: { id: true, district: true, town: true, active: true },
    });
  }

  /**
   * Deletes a zone if not referenced by existing prices or quotes.
   */
  async deleteZone(id: number) {
    try {
      await this.db.zone.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new HttpError(
          409,
          "ZONE_IN_USE",
          "This district is used by pricing or delivery records and cannot be deleted.",
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new HttpError(404, "ZONE_NOT_FOUND", "District not found.");
      }
      throw error;
    }
  }

  /**
   * Lists all price rules, newest effective date first.
   */
  async listPrices() {
    return this.db.priceVersion.findMany({
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    });
  }

  /**
   * Creates a new pricing rule with future effectiveFrom date.
   */
  async createPrice(input: PriceInput) {
    if (input.originZoneId === input.destinationZoneId) {
      throw new HttpError(
        400,
        "INVALID_ROUTE",
        "Choose different pickup and delivery districts.",
      );
    }
    const [origin, destination] = await Promise.all([
      this.db.zone.findUnique({ where: { id: input.originZoneId } }),
      this.db.zone.findUnique({ where: { id: input.destinationZoneId } }),
    ]);
    if (!origin?.active || !destination?.active) {
      throw new HttpError(400, "ZONE_INACTIVE", "Choose two active districts.");
    }
    if (new Date(input.effectiveFrom) <= new Date()) {
      throw new HttpError(
        400,
        "INVALID_EFFECTIVE_DATE",
        "New prices must take effect in the future.",
      );
    }
    return this.db.priceVersion.create({
      data: { ...input, effectiveFrom: new Date(input.effectiveFrom) },
    });
  }
}
