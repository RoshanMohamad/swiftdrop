export const ROUTING_KEYS = {
  PARCEL_CREATED: "parcel.created",
  PARCEL_STATUS_CHANGED: "parcel.status.changed",
  PARCEL_ASSIGNED: "parcel.assignment.changed",
  ALL_PARCEL: "parcel.#",
} as const;

export const QUEUES = {
  NOTIFICATIONS: "notifications.q",
  REALTIME: "realtime.q",
  WEBHOOKS: "webhooks.q",
} as const;
