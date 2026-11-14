import { Prisma } from "@swiftdrop/db";
import { canReattemptDelivery, type ParcelStatus } from "@swiftdrop/contracts";

/**
 * Courier capacity protocol (plan X-07, FR-D2). Every code path that changes who is carrying a
 * parcel, or whether a parcel still counts against a courier, follows the same order:
 *   1. lock the affected courier_profiles rows, ascending user_id, in one statement;
 *   2. lock/update the parcel row and re-check its version;
 *   3. change workload and the assignment row in that same transaction.
 * Locking in one global order means two transactions can never wait on each other.
 */
export type CapacityTransaction = Prisma.TransactionClient;

export async function lockCourierRows(
  tx: CapacityTransaction,
  courierIds: Array<number | null | undefined>,
) {
  const ids = [
    ...new Set(courierIds.filter((id): id is number => id != null)),
  ].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT user_id FROM courier_profiles WHERE user_id IN (${Prisma.join(ids)}) ORDER BY user_id FOR UPDATE`;
}

export async function lockParcelRow(tx: CapacityTransaction, parcelId: string) {
  const rows = await tx.$queryRaw<
    Array<{
      status: ParcelStatus;
      version: number;
      attempt_count: number;
      tracking_number: string;
    }>
  >`SELECT status::text AS status, version, attempt_count, tracking_number FROM parcels WHERE id = ${parcelId}::uuid FOR UPDATE`;
  const row = rows[0];
  return row
    ? {
        status: row.status,
        version: row.version,
        attemptCount: row.attempt_count,
        trackingNumber: row.tracking_number,
      }
    : null;
}

/** The courier currently carrying the parcel (unreleased assignment), without locking. */
export async function activeCourierOf(
  tx: CapacityTransaction,
  parcelId: string,
): Promise<number | null> {
  const row = await tx.parcelAssignment.findFirst({
    where: { parcelId, releasedAt: null },
    select: { courierId: true },
  });
  return row?.courierId ?? null;
}

/** A parcel that no longer counts against a courier: delivered, cancelled or finally failed. */
export function isFinishedForCapacity(
  status: ParcelStatus,
  attemptCount: number,
): boolean {
  return (
    status === "DELIVERED" ||
    status === "CANCELLED" ||
    (status === "FAILED" && !canReattemptDelivery(attemptCount))
  );
}

export function releaseReasonFor(status: ParcelStatus) {
  return status === "DELIVERED"
    ? "DELIVERED"
    : status === "CANCELLED"
      ? "CANCELLED"
      : "FAILED";
}

/** Return one unit of capacity exactly once; the caller already holds the courier row lock. */
export async function releaseAssignment(
  tx: CapacityTransaction,
  parcelId: string,
  reason: string,
) {
  const released = await tx.parcelAssignment.updateMany({
    where: { parcelId, releasedAt: null },
    data: { releasedAt: new Date(), releaseReason: reason },
  });
  if (released.count === 0) return false;
  const row = await tx.parcelAssignment.findUniqueOrThrow({
    where: { parcelId },
    select: { courierId: true },
  });
  await tx.courierProfile.updateMany({
    where: { userId: row.courierId, workload: { gt: 0 } },
    data: { workload: { decrement: 1 } },
  });
  return true;
}
