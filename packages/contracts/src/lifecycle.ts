import { z } from "zod";

/**
 * Parcel lifecycle (FR-P4). Single source of truth for the parcel state machine,
 * shared by the API, UIs and tests. Only M05's `LifecycleService` applies these
 * transitions to `parcels.current_status` / `version` / `attempt_count`.
 */
export const parcelStatuses = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;

export const parcelStatusSchema = z.enum(parcelStatuses);
export type ParcelStatus = (typeof parcelStatuses)[number];

/**
 * The one transition table. Happy path:
 *   CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
 * A delivery attempt may fail (OUT_FOR_DELIVERY → FAILED) and be re-attempted
 * (FAILED → OUT_FOR_DELIVERY) up to `MAX_DELIVERY_ATTEMPTS` total. A parcel may be
 * CANCELLED only before pickup (from CREATED). DELIVERED and CANCELLED are terminal.
 * An illegal transition must surface as HTTP 409 at the API boundary.
 */
export const PARCEL_TRANSITIONS: Readonly<
  Record<ParcelStatus, readonly ParcelStatus[]>
> = {
  CREATED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  FAILED: ["OUT_FOR_DELIVERY"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Total delivery attempts allowed before a FAILED parcel is finally failed (FR-P4). */
export const MAX_DELIVERY_ATTEMPTS = 3;

/** Structural legality of a `from` → `to` transition, independent of attempt counts. */
export function canTransition(from: ParcelStatus, to: ParcelStatus): boolean {
  return PARCEL_TRANSITIONS[from].includes(to);
}

/** A status with no outgoing transitions (DELIVERED, CANCELLED). */
export function isTerminalStatus(status: ParcelStatus): boolean {
  return PARCEL_TRANSITIONS[status].length === 0;
}

/**
 * `attempt_count` starts at 0 and increments each time a parcel enters
 * OUT_FOR_DELIVERY (FR-P4). Every other transition leaves it unchanged.
 */
export function attemptCountAfter(
  to: ParcelStatus,
  attemptCount: number,
): number {
  return to === "OUT_FOR_DELIVERY" ? attemptCount + 1 : attemptCount;
}

/**
 * Whether a FAILED parcel may still be re-attempted given how many delivery
 * attempts it has already consumed. When no attempts remain, final failure
 * releases courier capacity and the parcel stays terminally FAILED.
 */
export function canReattemptDelivery(attemptCount: number): boolean {
  return attemptCount < MAX_DELIVERY_ATTEMPTS;
}
