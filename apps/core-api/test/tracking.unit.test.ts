import { describe, expect, it } from "@jest/globals";
import {
  TRACKING_ALPHABET,
  TRACKING_PATTERN,
  formatTrackingNumber,
  isValidTrackingNumber,
  trackingCheckCharacter,
  trackingNumberSchema,
} from "@swiftdrop/contracts";
import { generateTrackingNumber } from "../src/modules/parcels/tracking.js";

describe("tracking number format (claude.md: SD- + 8 characters + check character)", () => {
  it("builds SD-XXXXXXXX-C from an 8 character body", () => {
    const number = formatTrackingNumber("7KQ2M9XA");
    expect(number).toBe("SD-7KQ2M9XA-Y");
    expect(number).toHaveLength(13);
    expect(number).toMatch(TRACKING_PATTERN);
    expect(isValidTrackingNumber(number)).toBe(true);
    expect(trackingNumberSchema.safeParse(number).success).toBe(true);
  });

  it("uses an alphabet without look-alike characters", () => {
    for (const confusable of ["0", "O", "1", "I", "L"])
      expect(TRACKING_ALPHABET).not.toContain(confusable);
    expect(new Set(TRACKING_ALPHABET).size).toBe(TRACKING_ALPHABET.length);
    expect(TRACKING_ALPHABET).toHaveLength(31);
    expect(isValidTrackingNumber("SD-7KQ2M9X0-Y")).toBe(false);
    expect(isValidTrackingNumber("SD-7KQ2M9XI-Y")).toBe(false);
  });

  it("rejects anything that is not exactly the format, including the old one", () => {
    for (const bad of [
      "SD7KQ2M9XAY",
      "SD1234567A",
      "SD-7KQ2M9XA",
      "SD-7KQ2M9XA-",
      "SD-7KQ2M9XAY-Y",
      "sd-7kq2m9xa-y",
      " SD-7KQ2M9XA-Y",
      "SD-7KQ2M9XA-Y ",
      "SD-7KQ2M9XA-Y\n",
      "XX-7KQ2M9XA-Y",
      "",
    ])
      expect(isValidTrackingNumber(bad)).toBe(false);
  });

  it("detects every single-character typo", () => {
    const original = "SD-7KQ2M9XA-Y";
    let checked = 0;
    for (let position = 3; position < 13; position++) {
      if (position === 11) continue; // the hyphen
      for (const replacement of TRACKING_ALPHABET) {
        if (replacement === original[position]) continue;
        const typo =
          original.slice(0, position) + replacement + original.slice(position + 1);
        expect(isValidTrackingNumber(typo)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(250);
  });

  it("detects every swap of two different adjacent characters", () => {
    const body = "7KQ2M9XA";
    const number = formatTrackingNumber(body);
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i] === body[i + 1]) continue;
      const swapped =
        body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      const forged = `SD-${swapped}-${number.at(-1)}`;
      expect(isValidTrackingNumber(forged)).toBe(false);
    }
  });

  it("derives the check character from the body alone and always stays in the alphabet", () => {
    for (const body of ["22222222", "ZZZZZZZZ", "A2B3C4D5", "9WCV3FGE"]) {
      const check = trackingCheckCharacter(body);
      expect(TRACKING_ALPHABET).toContain(check);
      expect(formatTrackingNumber(body)).toBe(`SD-${body}-${check}`);
    }
  });
});

describe("generateTrackingNumber", () => {
  it("always produces a valid number", () => {
    for (let i = 0; i < 500; i++) {
      const number = generateTrackingNumber();
      expect(isValidTrackingNumber(number)).toBe(true);
      expect(trackingNumberSchema.safeParse(number).success).toBe(true);
    }
  });

  it("is random: no repeats in 20,000 numbers and no ordering between neighbours", () => {
    const seen = new Set<string>();
    let ascending = 0;
    let previous = "";
    for (let i = 0; i < 20_000; i++) {
      const number = generateTrackingNumber();
      seen.add(number);
      if (number > previous) ascending++;
      previous = number;
    }
    expect(seen.size).toBe(20_000);
    // A sequential generator would be (almost) always ascending; random is about half.
    expect(ascending).toBeGreaterThan(9_000);
    expect(ascending).toBeLessThan(11_000);
  });

  it("draws every alphabet character about equally often (no modulo bias)", () => {
    const counts = new Map<string, number>();
    const total = 31_000;
    for (let i = 0; i < total / 8; i++)
      for (const character of generateTrackingNumber().slice(3, 11))
        counts.set(character, (counts.get(character) ?? 0) + 1);
    expect(counts.size).toBe(31);
    const expected = total / 31;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });
});
