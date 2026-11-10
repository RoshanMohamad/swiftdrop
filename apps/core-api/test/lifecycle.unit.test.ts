import { describe, it, expect } from "@jest/globals";
import {
  parcelStatuses,
  parcelStatusSchema,
  PARCEL_TRANSITIONS,
  MAX_DELIVERY_ATTEMPTS,
  canTransition,
  isTerminalStatus,
  attemptCountAfter,
  canReattemptDelivery,
  type ParcelStatus,
} from "@swiftdrop/contracts";

describe("parcel transition table (FR-P4)", () => {
  it("accepts the full happy path CREATED → ... → DELIVERED", () => {
    const happyPath: ParcelStatus[] = [
      "CREATED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it("allows cancellation only before pickup", () => {
    expect(canTransition("CREATED", "CANCELLED")).toBe(true);
    for (const from of parcelStatuses) {
      if (from === "CREATED") continue;
      expect(canTransition(from, "CANCELLED")).toBe(false);
    }
  });

  it("allows a failed delivery and its re-attempt", () => {
    expect(canTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);
    expect(canTransition("FAILED", "OUT_FOR_DELIVERY")).toBe(true);
  });

  it("rejects representative illegal transitions", () => {
    expect(canTransition("CREATED", "DELIVERED")).toBe(false);
    expect(canTransition("CREATED", "IN_TRANSIT")).toBe(false);
    expect(canTransition("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransition("IN_TRANSIT", "DELIVERED")).toBe(false);
    expect(canTransition("FAILED", "CANCELLED")).toBe(false);
  });

  it("never allows a self-transition", () => {
    for (const status of parcelStatuses) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("only CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, FAILED have exits", () => {
    expect(isTerminalStatus("DELIVERED")).toBe(true);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
    for (const status of parcelStatuses) {
      if (status === "DELIVERED" || status === "CANCELLED") continue;
      expect(isTerminalStatus(status)).toBe(false);
    }
  });

  it("keeps the table internally consistent", () => {
    for (const [from, targets] of Object.entries(PARCEL_TRANSITIONS)) {
      expect(parcelStatusSchema.safeParse(from).success).toBe(true);
      for (const to of targets) {
        // every declared target is itself a valid status
        expect(parcelStatuses).toContain(to);
        // canTransition agrees with the raw table
        expect(canTransition(from as ParcelStatus, to)).toBe(true);
      }
    }
  });
});

describe("delivery attempt accounting (FR-P4)", () => {
  it("increments attempt_count only when entering OUT_FOR_DELIVERY", () => {
    expect(attemptCountAfter("OUT_FOR_DELIVERY", 0)).toBe(1);
    expect(attemptCountAfter("OUT_FOR_DELIVERY", 2)).toBe(3);
    for (const status of parcelStatuses) {
      if (status === "OUT_FOR_DELIVERY") continue;
      expect(attemptCountAfter(status, 2)).toBe(2);
    }
  });

  it("permits two re-attempts (three attempts total) then stops", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
    expect(canReattemptDelivery(0)).toBe(true);
    expect(canReattemptDelivery(1)).toBe(true);
    expect(canReattemptDelivery(2)).toBe(true);
    expect(canReattemptDelivery(3)).toBe(false);
    expect(canReattemptDelivery(4)).toBe(false);
  });
});
