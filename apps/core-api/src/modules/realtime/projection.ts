import {
  courierAssignmentEventSchema,
  privateAssignedEventSchema,
  privateStatusEventSchema,
  publicStatusEventSchema,
  REALTIME_EVENTS,
  type SwiftDropEvent,
} from "@swiftdrop/contracts";

export const publicRoom = (trackingNumber: string) =>
  `public:${trackingNumber}`;
export const privateRoom = (parcelId: string) => `private:${parcelId}`;
export const userRoom = (userId: number | string) => `user:${userId}`;

export interface Emit {
  room: string;
  event: string;
  payload: unknown;
}
export interface Projection {
  emits: Emit[];
  /** Sockets of this user must leave this private room (reassignment, FR-I6). */
  revoke?: { userId: number; room: string };
}

/**
 * Turn a domain event into room-specific DTOs. The public projection is built field by field
 * from status/time/town/sequence, and each schema is `strict`, so adding a field here without
 * updating the contract fails loudly instead of leaking it.
 */
export function project(event: SwiftDropEvent): Projection {
  if (
    event.type === "parcel.created" ||
    event.type === "parcel.status.changed"
  ) {
    const created = event.type === "parcel.created";
    const base = {
      trackingNumber: event.data.trackingNo,
      status: created
        ? ("CREATED" as const)
        : (event as Extract<SwiftDropEvent, { type: "parcel.status.changed" }>)
            .data.to,
      town: created
        ? null
        : ((event as Extract<SwiftDropEvent, { type: "parcel.status.changed" }>)
            .data.town ?? null),
      occurredAt: event.occurredAt,
      sequence: event.sequence,
    };
    return {
      emits: [
        {
          room: publicRoom(event.data.trackingNo),
          event: REALTIME_EVENTS.status,
          payload: publicStatusEventSchema.parse(base),
        },
        {
          room: privateRoom(event.data.parcelId),
          event: REALTIME_EVENTS.status,
          payload: privateStatusEventSchema.parse({
            ...base,
            parcelId: event.data.parcelId,
          }),
        },
      ],
    };
  }

  const assigned = {
    parcelId: event.data.parcelId,
    trackingNumber: event.data.trackingNo,
    occurredAt: event.occurredAt,
    sequence: event.sequence,
  };
  const emits: Emit[] = [
    {
      room: privateRoom(event.data.parcelId),
      event: REALTIME_EVENTS.assigned,
      payload: privateAssignedEventSchema.parse(assigned),
    },
  ];
  const next = Number(event.data.newCourierId);
  const previous = Number(event.data.oldCourierId);
  if (event.data.newCourierId && Number.isInteger(next))
    emits.push({
      room: userRoom(next),
      event: REALTIME_EVENTS.assigned,
      payload: courierAssignmentEventSchema.parse({
        ...assigned,
        change: "assigned",
      }),
    });
  const hasPrevious =
    Boolean(event.data.oldCourierId) && Number.isInteger(previous);
  if (hasPrevious)
    emits.push({
      room: userRoom(previous),
      event: REALTIME_EVENTS.assigned,
      payload: courierAssignmentEventSchema.parse({
        ...assigned,
        change: "unassigned",
      }),
    });
  return {
    emits,
    ...(hasPrevious
      ? { revoke: { userId: previous, room: privateRoom(event.data.parcelId) } }
      : {}),
  };
}
