import { HttpError } from "../../shared/problem.js";

export interface QuoteCalculationInput {
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PricingRuleSnapshot {
  id: number;
  originZoneId: number;
  destinationZoneId: number;
  baseCents: number;
  perExtraKgCents: number;
  effectiveFrom: Date;
}

export interface PricingStrategy {
  calculate(input: QuoteCalculationInput, rule: PricingRuleSnapshot): number;
}

/**
 * StandardPricingStrategy
 * Implements linear pricing: baseFee + ceil(max(0, weightGrams - 1000) / 1000) * perExtraKgFee.
 * Conforms to Design Document §8.1 & §8.2.
 */
export class StandardPricingStrategy implements PricingStrategy {
  calculate(input: QuoteCalculationInput, rule: PricingRuleSnapshot): number {
    const extraKg = Math.ceil(Math.max(0, input.weightGrams - 1000) / 1000);
    const feeCents = rule.baseCents + rule.perExtraKgCents * extraKg;
    if (!Number.isSafeInteger(feeCents) || feeCents > 2_147_483_647) {
      throw new HttpError(
        503,
        "PRICE_UNAVAILABLE",
        "The current price configuration cannot be used. Please contact support.",
      );
    }
    return feeCents;
  }
}

export class PricingStrategyFactory {
  static getStrategy(type: "STANDARD" = "STANDARD"): PricingStrategy {
    switch (type) {
      case "STANDARD":
      default:
        return new StandardPricingStrategy();
    }
  }
}
