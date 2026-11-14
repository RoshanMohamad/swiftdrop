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

const MAX_FEE_CENTS = 2_147_483_647;

function assertFee(feeCents: number): number {
  if (!Number.isSafeInteger(feeCents) || feeCents < 0 || feeCents > MAX_FEE_CENTS) {
    throw new HttpError(
      503,
      "PRICE_UNAVAILABLE",
      "The current price configuration cannot be used. Please contact support.",
    );
  }
  return feeCents;
}

/**
 * ExpressPricing
 * The Standard fee scaled by a multiplier. claude.md gives no Express formula, so no number is
 * hard-coded: the multiplier (in basis points, 10000 = 1.0x) must be supplied by configuration.
 * Integer arithmetic only; no floats for currency.
 */
export class ExpressPricingStrategy implements PricingStrategy {
  private readonly standard = new StandardPricingStrategy();
  constructor(private readonly multiplierBasisPoints: number) {
    if (
      !Number.isSafeInteger(multiplierBasisPoints) ||
      multiplierBasisPoints < 10_000
    )
      throw new RangeError(
        "Express multiplier must be an integer number of basis points of at least 10000.",
      );
  }

  calculate(input: QuoteCalculationInput, rule: PricingRuleSnapshot): number {
    const standard = this.standard.calculate(input, rule);
    const scaled =
      (BigInt(standard) * BigInt(this.multiplierBasisPoints) + 5_000n) /
      10_000n;
    return assertFee(Number(scaled));
  }
}

export interface MerchantContractRate {
  baseCents: number;
  perExtraKgCents: number;
}

/**
 * MerchantContractPricing
 * Applies the same weight formula as Standard but with the merchant's negotiated rates, which
 * the caller passes in. The zone rule is only the route reference and is not used for the fee.
 */
export class MerchantContractPricingStrategy implements PricingStrategy {
  constructor(private readonly contract: MerchantContractRate) {
    for (const value of [contract.baseCents, contract.perExtraKgCents])
      if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError("Contract rates must be non-negative integer cents.");
  }

  calculate(input: QuoteCalculationInput, rule: PricingRuleSnapshot): number {
    return new StandardPricingStrategy().calculate(input, {
      ...rule,
      baseCents: this.contract.baseCents,
      perExtraKgCents: this.contract.perExtraKgCents,
    });
  }
}

export type PricingStrategyOptions = {
  expressMultiplierBasisPoints?: number;
  merchantContract?: MerchantContractRate;
};

export class PricingStrategyFactory {
  static getStrategy(
    type: "STANDARD" | "EXPRESS" | "MERCHANT_CONTRACT" = "STANDARD",
    options: PricingStrategyOptions = {},
  ): PricingStrategy {
    switch (type) {
      case "EXPRESS":
        if (options.expressMultiplierBasisPoints === undefined)
          throw new HttpError(
            503,
            "PRICE_UNAVAILABLE",
            "Express pricing is not configured.",
          );
        return new ExpressPricingStrategy(options.expressMultiplierBasisPoints);
      case "MERCHANT_CONTRACT":
        if (!options.merchantContract)
          throw new HttpError(
            503,
            "PRICE_UNAVAILABLE",
            "No contract rate was supplied for this merchant.",
          );
        return new MerchantContractPricingStrategy(options.merchantContract);
      case "STANDARD":
      default:
        return new StandardPricingStrategy();
    }
  }
}
