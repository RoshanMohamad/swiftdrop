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

/**
 * Strategy interface for delivery quote price calculation.
 * Encapsulates the pricing algorithm so that distinct business models
 * (e.g. Standard weight tier, Promotional, Express) can be configured
 * or swapped dynamically at runtime without modifying client code.
 *
 * @see SWIFTDROP_DESIGN_DOCUMENTATION.md §8.1 & §8.2
 */
export interface PricingStrategy {
  /**
   * Calculates the delivery fee in Sri Lankan Rupee integer cents.
   *
   * @param input Parcel physical dimensions and weight in grams.
   * @param rule The active versioned pricing rule snapshot applicable to the route.
   * @returns Calculated total delivery fee in integer cents (LKR).
   * @throws {HttpError} 503 if fee exceeds 32-bit integer boundaries.
   */
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
