import { Prisma, type Database } from "@swiftdrop/db";
import {
  canReattemptDelivery,
  type AssignResult,
  type CourierSummary,
  type DispatchParcelPage,
  type DispatchState,
  type ParcelStatus,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import { outbox } from "../../shared/outbox/index.js";
import { activeCourierOf, lockCourierRows, lockParcelRow } from "./capacity.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSIGNABLE: ParcelStatus[] = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "FAILED",
];

const notFound = (what: string) =>
  new HttpError(404, "NOT_FOUND", `${what} was not found.`);

export function encodeKeyset(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}
export function decodeKeyset(cursor: string) {
  try {
    const [time, id] = Buffer.from(cursor, "base64url")
      .toString("utf8")
      .split("|");
    const createdAt = new Date(time ?? "");
    if (Number.isNaN(createdAt.getTime()) || !id || !UUID.test(id))
      throw new Error();
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "CURSOR", "The page cursor is invalid.");
  }
}

/** Dispatcher console backend (FR-D1, FR-D2, FR-D3). Admin inherits via requireRole. */
export class DispatchService {
  constructor(private db: Database) {}

  /** FR-D1: unassigned queue (oldest first, pickup-zone filter) or the assigned list for reassignment. */
  async listParcels(filters: {
    state: DispatchState;
    zoneId?: number;
    cursor?: string;
    limit?: number;
  }): Promise<DispatchParcelPage> {
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const after = filters.cursor ? decodeKeyset(filters.cursor) : undefined;
    const rows = await this.db.parcel.findMany({
      where: {
        ...(filters.zoneId ? { originZoneId: filters.zoneId } : {}),
        ...(filters.state === "unassigned"
          ? { status: "CREATED", assignment: { is: null } }
          : {
              status: { in: ASSIGNABLE },
              assignment: { is: { releasedAt: null } },
            }),
        ...(after
          ? {
              OR: [
                { createdAt: { gt: after.createdAt } },
                { createdAt: after.createdAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        version: true,
        attemptCount: true,
        originZoneId: true,
        createdAt: true,
        originZone: { select: { town: true } },
        destinationZone: { select: { town: true } },
        assignment: { select: { courierId: true, releasedAt: true } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        trackingNumber: row.trackingNumber,
        status: row.status,
        version: row.version,
        attemptCount: row.attemptCount,
        originZoneId: row.originZoneId,
        originTown: row.originZone.town,
        destinationTown: row.destinationZone.town,
        courierId:
          row.assignment && !row.assignment.releasedAt
            ? row.assignment.courierId
            : null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeKeyset(last.createdAt, last.id)
          : null,
    };
  }

  /** FR-D3: every active courier with duty state and workload. */
  async listCouriers(): Promise<CourierSummary[]> {
    const users = await this.db.user.findMany({
      where: { roleId: "COURIER", status: "ACTIVE" },
      orderBy: { id: "asc" },
      take: 200,
      select: {
        id: true,
        fullName: true,
        courierProfile: {
          select: { onDuty: true, capacity: true, workload: true },
        },
      },
    });
    return users.map((user) => ({
      userId: user.id,
      fullName: user.fullName,
      onDuty: user.courierProfile?.onDuty ?? false,
      capacity: user.courierProfile?.capacity ?? 10,
      workload: user.courierProfile?.workload ?? 0,
      hasProfile: user.courierProfile !== null,
    }));
  }

  /**
   * Create or update a courier's capacity profile. Takes the courier row lock like every other
   * capacity path; capacity may not drop below the current workload.
   */
  async updateProfile(
    courierId: number,
    change: { onDuty?: boolean; capacity?: number },
  ): Promise<CourierSummary> {
    const user = await this.db.user.findFirst({
      where: { id: courierId, roleId: "COURIER", status: "ACTIVE" },
      select: { id: true, fullName: true },
    });
    if (!user) throw notFound("Courier");
    return this.db.$transaction(async (tx) => {
      await tx.courierProfile.upsert({
        where: { userId: courierId },
        update: {},
        create: { userId: courierId },
      });
      await lockCourierRows(tx, [courierId]);
      const profile = await tx.courierProfile.findUniqueOrThrow({
        where: { userId: courierId },
      });
      if (change.capacity !== undefined && change.capacity < profile.workload)
        throw new HttpError(
          409,
          "CAPACITY_BELOW_WORKLOAD",
          `This courier is carrying ${profile.workload} parcels; reassign some first.`,
        );
      const updated = await tx.courierProfile.update({
        where: { userId: courierId },
        data: change,
      });
      return {
        userId: courierId,
        fullName: user.fullName,
        onDuty: updated.onDuty,
        capacity: updated.capacity,
        workload: updated.workload,
        hasProfile: true,
      };
    });
  }

  /**
   * FR-D2 assign/reassign. Locks old and new courier rows in ascending id order, then the parcel,
   * re-checks version, duty and reserved capacity, and atomically moves workload, bumps the parcel
   * version and writes the outbox event. Choosing the current courier is a no-op.
   */
  async assign(
    actorId: number,
    parcelId: string,
    courierId: number,
    expectedVersion: number,
  ): Promise<AssignResult> {
    if (!UUID.test(parcelId)) throw notFound("Parcel");
    try {
      return await this.db.$transaction(
        async (tx) => {
          const previousCourier = await activeCourierOf(tx, parcelId);
          if (previousCourier === courierId) {
            const current = await tx.parcel.findUnique({
              where: { id: parcelId },
              select: { version: true },
            });
            if (!current) throw notFound("Parcel");
            return {
              parcelId,
              courierId,
              version: current.version,
              changed: false,
            };
          }
          await lockCourierRows(tx, [previousCourier, courierId]);
          const parcel = await lockParcelRow(tx, parcelId);
          if (!parcel) throw notFound("Parcel");
          if (parcel.version !== expectedVersion)
            throw new HttpError(
              409,
              "VERSION_CONFLICT",
              "This parcel was changed by someone else. Refresh and retry.",
            );
          if (
            !ASSIGNABLE.includes(parcel.status) ||
            (parcel.status === "FAILED" &&
              !canReattemptDelivery(parcel.attemptCount))
          )
            throw new HttpError(
              409,
              "PARCEL_NOT_ASSIGNABLE",
              "This parcel is finished and cannot be assigned.",
            );
          // The assignment may have changed between the unlocked read and the locks.
          if ((await activeCourierOf(tx, parcelId)) !== previousCourier)
            throw new HttpError(
              409,
              "VERSION_CONFLICT",
              "This parcel was reassigned by someone else. Refresh and retry.",
            );
          const target = await tx.courierProfile.findUnique({
            where: { userId: courierId },
            include: { user: { select: { roleId: true, status: true } } },
          });
          if (
            !target ||
            target.user.roleId !== "COURIER" ||
            target.user.status !== "ACTIVE"
          )
            throw notFound("Courier");
          if (!target.onDuty)
            throw new HttpError(
              409,
              "COURIER_OFF_DUTY",
              "This courier is not on duty.",
            );
          if (target.workload >= target.capacity)
            throw new HttpError(
              409,
              "COURIER_AT_CAPACITY",
              "This courier has no free capacity.",
            );
          await tx.courierProfile.update({
            where: { userId: courierId },
            data: { workload: { increment: 1 } },
          });
          if (previousCourier !== null)
            await tx.courierProfile.updateMany({
              where: { userId: previousCourier, workload: { gt: 0 } },
              data: { workload: { decrement: 1 } },
            });
          await tx.parcelAssignment.upsert({
            where: { parcelId },
            update: {
              courierId,
              assignedById: actorId,
              assignedAt: new Date(),
              releasedAt: null,
              releaseReason: null,
            },
            create: { parcelId, courierId, assignedById: actorId },
          });
          const newVersion = parcel.version + 1;
          await tx.parcel.update({
            where: { id: parcelId },
            data: { version: newVersion },
          });
          await outbox.add(tx, {
            type: "parcel.assignment.changed",
            aggregateId: parcelId,
            sequence: newVersion,
            data: {
              parcelId,
              trackingNo: parcel.trackingNumber,
              newCourierId: String(courierId),
              ...(previousCourier !== null
                ? { oldCourierId: String(previousCourier) }
                : {}),
            },
          });
          return { parcelId, courierId, version: newVersion, changed: true };
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      )
        throw new HttpError(
          409,
          "ASSIGNMENT_BUSY",
          "This parcel was assigned at the same time. Refresh and retry.",
        );
      throw error;
    }
  }
}
