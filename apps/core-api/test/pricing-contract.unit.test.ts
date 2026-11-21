import { describe, expect, it } from "@jest/globals";
import {
  ExpressPricingStrategy,
  MerchantContractPricingStrategy,
  PricingStrategyFactory,
  StandardPricingStrategy,
  type PricingRuleSnapshot,
  type PricingStrategy,
  type QuoteCalculationInput,
} from "../src/modules/pricing/strategy.js";
import { HttpError } from "../src/shared/problem.js";

// Worked example from claude.md: Colombo -> Kandy, small parcel, 2 kg = 45000 + 12000 cents.
const colomboKandy: PricingRuleSnapshot = {
  id: 1,
  originZoneId: 1,
  destinationZoneId: 2,
  baseCents: 45000,
  perExtraKgCents: 12000,
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
};
const parcel = (weightGrams: number): QuoteCalculationInput => ({
  weightGrams,
  lengthMm: 100,
  widthMm: 100,
  heightMm: 100,
});

const implementations: Array<[string, PricingStrategy]> = [
  ["StandardPricing", new StandardPricingStrategy()],
  ["ExpressPricing", new ExpressPricingStrategy(15_000)],
  [
    "MerchantContractPricing",
    new MerchantContractPricingStrategy({ baseCents: 40000, perExtraKgCents: 10000 }),
  ],
];

describe.each(implementations)("PricingStrategy contract: %s", (_name, strategy) => {
  it("returns a non-negative integer number of cents", () => {
    for (const grams of [1, 500, 1000, 1001, 2000, 25000]) {
      const fee = strategy.calculate(parcel(grams), colomboKandy);
      expect(Number.isInteger(fee)).toBe(true);
      expect(fee).toBeGreaterThanOrEqual(0);
    }
  });

  it("never charges less for a heavier parcel", () => {
    let previous = 0;
    for (const grams of [500, 1000, 1500, 2000, 5000, 20000]) {
      const fee = strategy.calculate(parcel(grams), colomboKandy);
      expect(fee).toBeGreaterThanOrEqual(previous);
      previous = fee;
    }
  });

  it("charges the same fee for the whole first kilogram", () => {
    expect(strategy.calculate(parcel(100), colomboKandy)).toBe(
      strategy.calculate(parcel(1000), colomboKandy),
    );
  });

  it("is deterministic", () => {
    expect(strategy.calculate(parcel(2000), colomboKandy)).toBe(
      strategy.calculate(parcel(2000), colomboKandy),
    );
  });

  it("rejects a fee beyond 32-bit integer bounds with 503 PRICE_UNAVAILABLE", () => {
    const overflow = { ...colomboKandy, baseCents: 2_000_000_000, perExtraKgCents: 500_000_000 };
    const wide = strategy instanceof MerchantContractPricingStrategy
      ? new MerchantContractPricingStrategy({ baseCents: 2_000_000_000, perExtraKgCents: 500_000_000 })
      : strategy;
    try {
      wide.calculate(parcel(5000), overflow);
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(503);
      expect((error as HttpError).code).toBe("PRICE_UNAVAILABLE");
    }
  });
});

describe("Pricing strategy values", () => {
  it("Standard: Colombo -> Kandy 2 kg is LKR 570.00 (57000 cents)", () => {
    expect(new StandardPricingStrategy().calculate(parcel(2000), colomboKandy)).toBe(57000);
  });

  it("Express scales the Standard fee by basis points with integer rounding", () => {
    expect(new ExpressPricingStrategy(15_000).calculate(parcel(2000), colomboKandy)).toBe(85500);
    expect(new ExpressPricingStrategy(10_000).calculate(parcel(2000), colomboKandy)).toBe(57000);
  });

  it("Express refuses a multiplier below 1.0x or a non-integer", () => {
    expect(() => new ExpressPricingStrategy(9_999)).toThrow(RangeError);
    expect(() => new ExpressPricingStrategy(15_000.5)).toThrow(RangeError);
  });

  it("MerchantContract uses the contract rates, not the zone rule", () => {
    const contract = new MerchantContractPricingStrategy({ baseCents: 40000, perExtraKgCents: 10000 });
    expect(contract.calculate(parcel(2000), colomboKandy)).toBe(50000);
  });

  it("MerchantContract refuses negative or fractional rates", () => {
    expect(() => new MerchantContractPricingStrategy({ baseCents: -1, perExtraKgCents: 0 })).toThrow(RangeError);
    expect(() => new MerchantContractPricingStrategy({ baseCents: 1.5, perExtraKgCents: 0 })).toThrow(RangeError);
  });
});

describe("PricingStrategyFactory", () => {
  it("returns the matching strategy for each type", () => {
    expect(PricingStrategyFactory.getStrategy("STANDARD")).toBeInstanceOf(StandardPricingStrategy);
    expect(
      PricingStrategyFactory.getStrategy("EXPRESS", { expressMultiplierBasisPoints: 12_000 }),
    ).toBeInstanceOf(ExpressPricingStrategy);
    expect(
      PricingStrategyFactory.getStrategy("MERCHANT_CONTRACT", {
        merchantContract: { baseCents: 1, perExtraKgCents: 1 },
      }),
    ).toBeInstanceOf(MerchantContractPricingStrategy);
  });

  it("does not invent numbers: Express and MerchantContract need their inputs", () => {
    expect(() => PricingStrategyFactory.getStrategy("EXPRESS")).toThrow(HttpError);
    expect(() => PricingStrategyFactory.getStrategy("MERCHANT_CONTRACT")).toThrow(HttpError);
  });
});
