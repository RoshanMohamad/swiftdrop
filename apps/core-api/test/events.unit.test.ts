import { describe, expect, it } from "@jest/globals";
import {
  isSwiftDropEvent,
  QUEUES,
  ROUTING_KEYS,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";

const base = {
  eventId: "11111111-1111-4111-8111-111111111111",
  version: 1 as const,
  occurredAt: "2026-11-13T10:30:00.000Z",
  sequence: 1,
};

const events: SwiftDropEvent[] = [
  {
    ...base,
    type: "parcel.created",
    data: {
      parcelId: "parcel-1",
      trackingNo: "SD1234567A",
      customerId: "1",
      originZone: "Colombo",
      destZone: "Kandy",
      feeCents: 1500,
      scheduledDate: "2026-11-13T10:30:00.000Z",
    },
  },
  {
    ...base,
    type: "parcel.status.changed",
    data: {
      parcelId: "parcel-1",
      trackingNo: "SD1234567A",
      from: "CREATED",
      to: "PICKED_UP",
      town: "Colombo",
      occurredAt: "2026-11-13T10:31:00.000Z",
    },
  },
  {
    ...base,
    type: "parcel.assignment.changed",
    data: {
      parcelId: "parcel-1",
      trackingNo: "SD1234567A",
      newCourierId: "courier-1",
    },
  },
];

describe("SwiftDrop RabbitMQ event contracts", () => {
  it.each(events)("accepts the $type v1 envelope", (event) => {
    expect(isSwiftDropEvent(event)).toBe(true);
  });

  it("rejects unknown versions, stale sequence values and invalid payloads", () => {
    expect(isSwiftDropEvent({ ...events[0], version: 2 })).toBe(false);
    expect(isSwiftDropEvent({ ...events[0], sequence: 0 })).toBe(false);
    expect(
      isSwiftDropEvent({
        ...events[1],
        data: { ...events[1].data, to: "UNKNOWN" },
      }),
    ).toBe(false);
    expect(isSwiftDropEvent({ ...events[2], data: [] })).toBe(false);
  });

  it("exports the agreed topic bindings and durable queue names", () => {
    expect(ROUTING_KEYS).toEqual({
      PARCEL_CREATED: "parcel.created",
      PARCEL_STATUS_CHANGED: "parcel.status.changed",
      PARCEL_ASSIGNED: "parcel.assignment.changed",
      ALL_PARCEL: "parcel.#",
    });
    expect(QUEUES).toEqual({
      NOTIFICATIONS: "notifications.q",
      REALTIME: "realtime.q",
      WEBHOOKS: "webhooks.q",
    });
  });
});
