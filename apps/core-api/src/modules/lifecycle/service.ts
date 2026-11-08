import { Prisma, type Database } from "@swiftdrop/db";
import {
  canTransition,
  canReattemptDelivery,
  attemptCountAfter,
  type ParcelStatus,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";

export class LifecycleService {
  constructor(private db: Database) {}

  /**
   * Transition a parcel to a new status. Uses optimistic locking via `version`.
   * Only M05 (this service) may write parcels.status / version / attempt_count.
   */
  async transition(
    parcelId: string,
    to: ParcelStatus,
    town: string,
    expectedVersion: number,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          const parcel = await tx.parcel.findUnique({
            where: { id: parcelId },
            select: { status: true, version: true, attemptCount: true },
          });
          if (!parcel)
            throw new HttpError(404, "PARCEL_NOT_FOUND", "Parcel not found.");

          const from = parcel.status as ParcelStatus;

          if (!canTransition(from, to))
            throw new HttpError(
              409,
              "ILLEGAL_TRANSITION",
              `Cannot move a parcel from ${from} to ${to}.`,
            );

          if (
            to === "OUT_FOR_DELIVERY" &&
            from === "FAILED" &&
            !canReattemptDelivery(parcel.attemptCount)
          )
            throw new HttpError(
              409,
              "MAX_ATTEMPTS_REACHED",
              "This parcel has reached the maximum number of delivery attempts.",
            );

          const newAttemptCount = attemptCountAfter(to, parcel.attemptCount);

          // Optimistic lock: update only if version still matches what caller read.
          const { count } = await tx.parcel.updateMany({
            where: { id: parcelId, version: expectedVersion },
            data: {
              status: to,
              version: { increment: 1 },
              attemptCount: newAttemptCount,
            },
          });

          if (count === 0)
            throw new HttpError(
              409,
              "VERSION_CONFLICT",
              "This parcel was modified by someone else. Reload and retry.",
            );

          await tx.parcelHistory.create({
            data: { parcelId, status: to, town },
          });

          return {
            status: to,
            version: expectedVersion + 1,
            attemptCount: newAttemptCount,
          };
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new HttpError(
          409,
          "STATUS_BUSY",
          "This parcel status changed at the same time. Retry.",
        );
      throw error;
    }
  }

  /**
   * Pre-pickup cancellation (FR-P9). Customers may only cancel their own parcel;
   * dispatchers and admins may cancel any parcel. Only allowed from CREATED.
   */
  async cancel(
    parcelId: string,
    requesterId: number,
    requesterRole: string,
    expectedVersion: number,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          const parcel = await tx.parcel.findUnique({
            where: { id: parcelId },
            include: { originZone: { select: { town: true } } },
          });
          if (!parcel)
            throw new HttpError(404, "PARCEL_NOT_FOUND", "Parcel not found.");

          if (requesterRole === "CUSTOMER" && parcel.userId !== requesterId)
            throw new HttpError(
              404,
              "PARCEL_NOT_FOUND",
              "Parcel not found.",
            );

          const from = parcel.status as ParcelStatus;
          if (!canTransition(from, "CANCELLED"))
            throw new HttpError(
              409,
              "CANCEL_NOT_ALLOWED",
              "This parcel can no longer be cancelled.",
            );

          const { count } = await tx.parcel.updateMany({
            where: { id: parcelId, version: expectedVersion },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });

          if (count === 0)
            throw new HttpError(
              409,
              "VERSION_CONFLICT",
              "This parcel was modified by someone else. Reload and retry.",
            );

          await tx.parcelHistory.create({
            data: {
              parcelId,
              status: "CANCELLED",
              town: parcel.originZone.town,
            },
          });

          return { status: "CANCELLED" as const, version: expectedVersion + 1 };
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new HttpError(
          409,
          "STATUS_BUSY",
          "This parcel status changed at the same time. Retry.",
        );
      throw error;
    }
  }
}
