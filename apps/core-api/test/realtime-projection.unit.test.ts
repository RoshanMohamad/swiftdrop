import { describe, expect, it } from "@jest/globals";
import {
  formatTrackingNumber,
  publicStatusEventSchema,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";
import { tokenExpiry } from "../src/modules/realtime/gateway.js";
import { project, publicRoom } from "../src/modules/realtime/projection.js";
const PARCEL = "11111111-1111-4111-8111-111111111111";

const validTracking = formatTrackingNumber("7KQ2M9XA");

const statusEvent = (
  to: "PICKED_UP" | "DELIVERED",
  sequence = 2,
): SwiftDropEvent => ({
  eventId: "22222222-2222-4222-8222-222222222222",
  type: "parcel.status.changed",
  version: 1,
  occurredAt: "2026-11-13T10:00:00.000Z",
  sequence,
  data: {
    parcelId: PARCEL,
    trackingNo: validTracking,
    courierId: "9",
    from: "CREATED",
    to,
    town: "Colombo",
    occurredAt: "2026-11-13T10:00:00.000Z",
  },
});
const assignment = (oldCourierId?: string): SwiftDropEvent => ({
  eventId: "44444444-4444-4444-8444-444444444444",
  type: "parcel.assignment.changed",
  version: 1,
  occurredAt: "2026-11-13T10:05:00.000Z",
  sequence: 3,
  data: {
    parcelId: PARCEL,
    trackingNo: validTracking,
    newCourierId: "9",
    ...(oldCourierId ? { oldCourierId } : {}),
  },
});

describe("realtime projections (X-12)", () => {
  it("builds a public projection with status, time, town and sequence only", () => {
    const { emits } = project(statusEvent("PICKED_UP"));
    const publicEmit = emits.find(
      (emit) => emit.room === publicRoom(validTracking),
    )!;
    expect(Object.keys(publicEmit.payload as object).sort()).toEqual([
      "occurredAt",
      "sequence",
      "status",
      "town",
      "trackingNumber",
    ]);
    expect(publicStatusEventSchema.safeParse(publicEmit.payload).success).toBe(
      true,
    );
    expect(JSON.stringify(publicEmit.payload)).not.toContain(PARCEL);
    expect(JSON.stringify(publicEmit.payload)).not.toContain("courier");
  });

  it("projects creation as CREATED without a town", () => {
    const created: SwiftDropEvent = {
      eventId: "55555555-5555-4555-8555-555555555555",
      type: "parcel.created",
      version: 1,
      occurredAt: "2026-11-13T09:00:00.000Z",
      sequence: 1,
      data: {
        parcelId: PARCEL,
        trackingNo: validTracking,
        originZone: "Colombo",
        destZone: "Kandy",
        feeCents: 100,
        scheduledDate: "2026-11-13",
      },
    };
    const first = project(created).emits[0]!;
    expect(first.payload).toMatchObject({
      status: "CREATED",
      town: null,
      sequence: 1,
    });
  });

  it("tells the new courier and the old courier, hides identity from the parcel room", () => {
    const projection = project(assignment("4"));
    const byRoom = Object.fromEntries(
      projection.emits.map((e) => [e.room, e.payload]),
    );
    expect(byRoom["user:9"]).toMatchObject({ change: "assigned" });
    expect(byRoom["user:4"]).toMatchObject({ change: "unassigned" });
    expect(JSON.stringify(byRoom[`private:${PARCEL}`])).not.toMatch(
      /courier|"9"|"4"/i,
    );
    expect(projection.revoke).toEqual({ userId: 4, room: `private:${PARCEL}` });
    expect(project(assignment()).revoke).toBeUndefined();
  });

  it("reads the expiry from a verified token and tolerates garbage", () => {
    const payload = Buffer.from(
      JSON.stringify({ exp: 1_800_000_000 }),
    ).toString("base64url");
    expect(tokenExpiry(`x.${payload}.y`)).toBe(1_800_000_000_000);
    expect(tokenExpiry("garbage")).toBeNull();
  });
});
