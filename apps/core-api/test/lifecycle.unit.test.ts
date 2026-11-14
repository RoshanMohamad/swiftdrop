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
  isSwiftDropEvent,
  ROUTING_KEYS,
  type ParcelStatus,
} from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";
import { LifecycleService } from "../src/modules/lifecycle/service.js";

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

describe("lifecycle outbox event envelopes", () => {
  const parcelId = "22222222-2222-4222-8222-222222222222";
  const occurredAt = new Date("2026-11-13T10:30:00.000Z");

  function createService(parcel: Record<string, unknown>) {
    const outbox: Array<Record<string, unknown>> = [];
    const transaction = {
      parcelAssignment: { findFirst: async () => null },
      parcel: {
        findUnique: async () => parcel,
        updateMany: async () => ({ count: 1 }),
      },
      parcelHistory: {
        create: async (args: { data: Record<string, unknown> }) => ({
          ...args.data,
          createdAt: occurredAt,
        }),
      },
      outboxEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          outbox.push(args.data);
          return args.data;
        },
      },
    };
    const db = {
      $transaction: async (
        work: (tx: typeof transaction) => Promise<unknown>,
      ) => work(transaction),
    } as unknown as Database;

    return { service: new LifecycleService(db), outbox };
  }

  it("emits a versioned status-changed envelope for a transition", async () => {
    const { service, outbox } = createService({
      status: "CREATED",
      version: 1,
      attemptCount: 0,
      trackingNumber: "SD1234567A",
    });

    await service.transition(parcelId, "PICKED_UP", "Colombo", 1);

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      eventType: ROUTING_KEYS.PARCEL_STATUS_CHANGED,
      aggregateId: parcelId,
    });
    const payload = outbox[0]?.payload;
    expect(isSwiftDropEvent(payload)).toBe(true);
    expect(payload).toMatchObject({
      type: ROUTING_KEYS.PARCEL_STATUS_CHANGED,
      version: 1,
      sequence: 2,
      data: {
        parcelId,
        trackingNo: "SD1234567A",
        from: "CREATED",
        to: "PICKED_UP",
        town: "Colombo",
      },
    });
  });

  it("emits the same envelope contract for cancellation", async () => {
    const { service, outbox } = createService({
      id: parcelId,
      userId: 7,
      status: "CREATED",
      version: 1,
      trackingNumber: "SD1234567A",
      originZone: { town: "Colombo" },
    });

    await service.cancel(parcelId, 7, "CUSTOMER", 1);

    expect(outbox).toHaveLength(1);
    const payload = outbox[0]?.payload;
    expect(isSwiftDropEvent(payload)).toBe(true);
    expect(payload).toMatchObject({
      type: ROUTING_KEYS.PARCEL_STATUS_CHANGED,
      version: 1,
      sequence: 2,
      data: {
        parcelId,
        from: "CREATED",
        to: "CANCELLED",
        town: "Colombo",
      },
    });
  });
});
