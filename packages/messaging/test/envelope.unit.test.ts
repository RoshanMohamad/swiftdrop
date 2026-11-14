import { describe, expect, it } from "@jest/globals";
import {
  eventEnvelopeSchema,
  findForbiddenKeys,
  webhookReplayRequestSchema,
} from "@swiftdrop/contracts";

const valid = {
  eventId: "6f1c2a9e-3b0d-4c7e-9a51-1d2f0c8b7e44",
  type: "parcel.status.changed",
  version: 1,
  occurredAt: "2026-10-23T09:14:05Z",
  sequence: 4,
  data: {
    parcelId: "6f1c2a9e-3b0d-4c7e-9a51-1d2f0c8b7e45",
    trackingNo: "SD-7KQ2M9XA-P",
    merchantId: 1042,
    from: "IN_TRANSIT",
    to: "OUT_FOR_DELIVERY",
  },
};

describe("event envelope (Design Doc §6.3)", () => {
  it("accepts the documented envelope", () => {
    expect(eventEnvelopeSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects unknown versions, bad types and unknown top-level fields", () => {
    expect(
      eventEnvelopeSchema.safeParse({ ...valid, version: 2 }).success,
    ).toBe(false);
    expect(
      eventEnvelopeSchema.safeParse({ ...valid, type: "Parcel Created" })
        .success,
    ).toBe(false);
    expect(eventEnvelopeSchema.safeParse({ ...valid, extra: 1 }).success).toBe(
      false,
    );
    expect(
      eventEnvelopeSchema.safeParse({ ...valid, sequence: 0 }).success,
    ).toBe(false);
  });
  it("rejects contact data anywhere in the payload (NFR-4)", () => {
    for (const data of [
      { ...valid.data, recipientName: "A" },
      { ...valid.data, nested: { phone: "+94771234567" } },
      { ...valid.data, list: [{ address: "x" }] },
      { ...valid.data, proofPhotoKey: "k" },
      { ...valid.data, note: "leave at door" },
    ])
      expect(eventEnvelopeSchema.safeParse({ ...valid, data }).success).toBe(
        false,
      );
    expect(findForbiddenKeys({ a: { recipientPhone: 1 } })).toEqual([
      "data.a.recipientPhone",
    ]);
  });
});

describe("replay request", () => {
  it("requires a short audited reason without control characters", () => {
    expect(webhookReplayRequestSchema.safeParse({ reason: "ok" }).success).toBe(
      false,
    );
    expect(
      webhookReplayRequestSchema.safeParse({
        reason: "Merchant fixed endpoint",
      }).success,
    ).toBe(true);
    expect(
      webhookReplayRequestSchema.safeParse({ reason: "bad\u0000reason" })
        .success,
    ).toBe(false);
    expect(
      webhookReplayRequestSchema.safeParse({ reason: "x".repeat(201) }).success,
    ).toBe(false);
  });
});
