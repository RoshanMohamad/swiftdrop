import { describe, expect, it } from "@jest/globals";
import {
  StandardPricingStrategy,
  PricingStrategyFactory,
  type PricingStrategy,
  type PricingRuleSnapshot,
  type QuoteCalculationInput,
} from "../src/modules/pricing/strategy.js";
import { PricingService } from "../src/modules/pricing/service.js";
import { HttpError } from "../src/shared/problem.js";
import type { Database } from "@swiftdrop/db";

describe("Pricing Strategy Pattern (FR-P2, Design Doc §8.1)", () => {
  const rule: PricingRuleSnapshot = {
    id: 1,
    originZoneId: 1,
    destinationZoneId: 2,
    baseCents: 50000, // 500.00 LKR
    perExtraKgCents: 10000, // 100.00 LKR / extra kg
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  };

  const strategy = new StandardPricingStrategy();

  it("calculates base fee for package up to 1kg (1000g)", () => {
    const input: QuoteCalculationInput = {
      weightGrams: 1000,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
    };
    expect(strategy.calculate(input, rule)).toBe(50000);
  });

  it("calculates base fee for package under 1kg (500g)", () => {
    const input: QuoteCalculationInput = {
      weightGrams: 500,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
    };
    expect(strategy.calculate(input, rule)).toBe(50000);
  });

  it("calculates ceiling extra fee for 1500g (1 extra kg)", () => {
    const input: QuoteCalculationInput = {
      weightGrams: 1500,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
    };
    // 50000 + 1 * 10000 = 60000
    expect(strategy.calculate(input, rule)).toBe(60000);
  });

  it("calculates ceiling extra fee for 2001g (2 extra kg)", () => {
    const input: QuoteCalculationInput = {
      weightGrams: 2001,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
    };
    // 50000 + 2 * 10000 = 70000
    expect(strategy.calculate(input, rule)).toBe(70000);
  });

  it("calculates exactly 1 extra kg for 2000g boundary", () => {
    const input: QuoteCalculationInput = {
      weightGrams: 2000,
      lengthMm: 150,
      widthMm: 150,
      heightMm: 150,
    };
    // 50000 + 1 * 10000 = 60000
    expect(strategy.calculate(input, rule)).toBe(60000);
  });

  it("calculates accurate fee for heavy delivery parcel (25kg)", () => {
    const input: QuoteCalculationInput = {
      weightGrams: 25000,
      lengthMm: 300,
      widthMm: 300,
      heightMm: 300,
    };
    // 50000 + 24 * 10000 = 290000 (LKR 2,900.00)
    expect(strategy.calculate(input, rule)).toBe(290000);
  });

  it("PricingStrategyFactory returns standard strategy by default", () => {
    const strat = PricingStrategyFactory.getStrategy("STANDARD");
    expect(strat).toBeInstanceOf(StandardPricingStrategy);
  });

  it("fails with 503 if calculated fee exceeds integer bounds", () => {
    const overflowRule: PricingRuleSnapshot = {
      ...rule,
      baseCents: 2_000_000_000,
      perExtraKgCents: 500_000_000,
    };
    const input: QuoteCalculationInput = {
      weightGrams: 5000,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
    };
    expect(() => strategy.calculate(input, overflowRule)).toThrow(HttpError);
    try {
      strategy.calculate(input, overflowRule);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(503);
      expect((e as HttpError).code).toBe("PRICE_UNAVAILABLE");
    }
  });

  it("supports custom strategy injection via PricingService.setStrategy", async () => {
    class FlatRateStrategy implements PricingStrategy {
      calculate(): number {
        return 99999;
      }
    }

    const mockDb = {
      zone: {
        findFirst: async ({
          where,
        }: {
          where: { district: { equals: string } };
        }) => ({
          id: where.district.equals === "Colombo" ? 1 : 2,
          district: where.district.equals,
          town: "Town",
          active: true,
        }),
      },
      priceVersion: {
        findFirst: async () => rule,
      },
      quote: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: "11111111-1111-1111-1111-111111111111",
        }),
      },
    } as unknown as Database;

    const service = new PricingService(mockDb);
    service.setStrategy(new FlatRateStrategy());

    const result = await service.createQuote(1, {
      originDistrict: "Colombo",
      destinationDistrict: "Kandy",
      weightGrams: 2000,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
    });

    expect(result.feeCents).toBe(99999);
  });
});

describe("PricingService quote creation & validation (FR-P1, FR-P2, X-04)", () => {
  it("rejects identical pickup and delivery districts with 422 INVALID_ROUTE", async () => {
    const mockDb = {
      zone: {
        findFirst: async () => ({
          id: 1,
          district: "Colombo",
          town: "Colombo",
          active: true,
        }),
      },
    } as unknown as Database;

    const service = new PricingService(mockDb);
    await expect(
      service.createQuote(1, {
        originDistrict: "Colombo",
        destinationDistrict: "Colombo",
        weightGrams: 1000,
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
      }),
    ).rejects.toThrow("Choose different pickup and delivery districts.");
  });

  it("rejects unserved districts with 422 UNSERVED_AREA", async () => {
    const mockDb = {
      zone: {
        findFirst: async ({
          where,
        }: {
          where: { district: { equals: string } };
        }) =>
          where.district.equals === "Colombo"
            ? { id: 1, district: "Colombo", town: "Colombo", active: true }
            : null,
      },
    } as unknown as Database;

    const service = new PricingService(mockDb);
    await expect(
      service.createQuote(1, {
        originDistrict: "Colombo",
        destinationDistrict: "Jaffna",
        weightGrams: 1000,
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
      }),
    ).rejects.toThrow("One or both districts are not currently served.");
  });

  it("rejects route when no effective price rule exists with 422 PRICE_UNAVAILABLE", async () => {
    const mockDb = {
      zone: {
        findFirst: async ({
          where,
        }: {
          where: { district: { equals: string } };
        }) => ({
          id: where.district.equals === "Colombo" ? 1 : 2,
          district: where.district.equals,
          town: "Town",
          active: true,
        }),
      },
      priceVersion: {
        findFirst: async () => null,
      },
    } as unknown as Database;

    const service = new PricingService(mockDb);
    await expect(
      service.createQuote(1, {
        originDistrict: "Colombo",
        destinationDistrict: "Kandy",
        weightGrams: 1000,
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
      }),
    ).rejects.toThrow("A price is not available for this route yet.");
  });

  it("Integration Contract X-04: validates quote for booking", async () => {
    const now = new Date();
    const validQuote = {
      id: "22222222-2222-2222-2222-222222222222",
      userId: 5,
      consumedAt: null,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      originZone: { id: 1, district: "Colombo", town: "Colombo" },
      destinationZone: { id: 2, district: "Kandy", town: "Kandy" },
    };

    const mockDb = {
      quote: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === validQuote.id ? validQuote : null,
      },
    } as unknown as Database;

    const service = new PricingService(mockDb);

    // Valid quote
    const res = await service.validateQuoteForBooking(validQuote.id, 5);
    expect(res.id).toBe(validQuote.id);

    // Foreign user
    await expect(
      service.validateQuoteForBooking(validQuote.id, 99),
    ).rejects.toThrow("Quote not found.");

    // Already consumed
    const consumedQuote = { ...validQuote, consumedAt: new Date() };
    const consumedDb = {
      quote: { findUnique: async () => consumedQuote },
    } as unknown as Database;
    await expect(
      new PricingService(consumedDb).validateQuoteForBooking(validQuote.id, 5),
    ).rejects.toThrow("This quote has already been booked.");

    // Expired
    const expiredQuote = {
      ...validQuote,
      expiresAt: new Date(now.getTime() - 1000),
    };
    const expiredDb = {
      quote: { findUnique: async () => expiredQuote },
    } as unknown as Database;
    await expect(
      new PricingService(expiredDb).validateQuoteForBooking(validQuote.id, 5),
    ).rejects.toThrow("This quote has expired.");
  });

  it("Zone and Price management enforces invariants", async () => {
    const mockDb = {
      zone: {
        findFirst: async ({
          where,
        }: {
          where: { district: { equals: string } };
        }) =>
          where.district.equals === "Existing"
            ? { id: 1, district: "Existing" }
            : null,
        findUnique: async ({ where }: { where: { id: number } }) =>
          where.id === 1
            ? { id: 1, district: "Colombo", town: "Colombo", active: true }
            : null,
      },
      priceVersion: {},
    } as unknown as Database;

    const service = new PricingService(mockDb);

    // Duplicate district
    await expect(
      service.createZone({ district: "Existing", town: "Town", active: true }),
    ).rejects.toThrow("That district is already in the service list.");

    // Mutating fixed district / town name throws 409
    await expect(
      service.updateZone(1, {
        district: "NewName",
        town: "Colombo",
        active: true,
      }),
    ).rejects.toThrow(
      "District names and public towns are fixed after creation",
    );

    // Creating price with past effective date throws 400
    await expect(
      service.createPrice({
        originZoneId: 1,
        destinationZoneId: 2,
        baseCents: 500,
        perExtraKgCents: 100,
        effectiveFrom: new Date(Date.now() - 60000).toISOString(),
      }),
    ).rejects.toThrow();
  });
});
