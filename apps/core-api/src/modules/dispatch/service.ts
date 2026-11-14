import { Prisma, type Database } from "@swiftdrop/db";
import {
  courierAssignmentSchema,
  dispatchAssignmentPageSchema,
  dispatchAssignmentRecordSchema,
  dispatchParcelAssignmentSchema,
  courierCapacityPageSchema,
  dispatchQueueSchema,
  type DispatchQueueQuery,
  type DispatchAssignmentQuery,
  type CourierAssignmentInput,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";

const activeAssignment = { status: "ACTIVE" as const };

const queueItem = (parcel: {
  id: string;
  trackingNumber: string;
  status: string;
  version: number;
  dispatchVersion: number;
  originZoneId: number;
  createdAt: Date;
  originZone: { town: string };
  destinationZone: { town: string };
  quote: { weightGrams: number };
}) => ({
  id: parcel.id,
  trackingNumber: parcel.trackingNumber,
  status: parcel.status,
  version: parcel.version,
  dispatchVersion: parcel.dispatchVersion,
  originZoneId: parcel.originZoneId,
  originTown: parcel.originZone.town,
  destinationTown: parcel.destinationZone.town,
  weightGrams: parcel.quote.weightGrams,
  createdAt: parcel.createdAt.toISOString(),
});

export class DispatchService {
  constructor(private db: Database) {}

  private assignmentRecord(assignment: {
    id: string;
    parcelId: string;
    status: "ACTIVE" | "RELEASED";
    assignedAt: Date;
    releasedAt: Date | null;
    courierProfile: {
      userId: number;
      user: { fullName: string | null };
    };
    parcel: Parameters<typeof queueItem>[0];
  }) {
    return dispatchAssignmentRecordSchema.parse({
      id: assignment.id,
      parcelId: assignment.parcelId,
      courierUserId: assignment.courierProfile.userId,
      courierName: assignment.courierProfile.user.fullName ?? "",
      dispatchVersion: assignment.parcel.dispatchVersion,
      status: assignment.status,
      assignedAt: assignment.assignedAt.toISOString(),
      releasedAt: assignment.releasedAt?.toISOString() ?? null,
      parcel: queueItem(assignment.parcel),
    });
  }

  async listUnassigned(input: DispatchQueueQuery) {
    const parcels = await this.db.parcel.findMany({
      where: {
        status: "CREATED",
        ...(input.pickupZoneId ? { originZoneId: input.pickupZoneId } : {}),
        assignments: { none: activeAssignment },
      },
      include: {
        originZone: { select: { town: true } },
        destinationZone: { select: { town: true } },
        quote: { select: { weightGrams: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit,
    });

    return dispatchQueueSchema.parse({ items: parcels.map(queueItem) });
  }

  async listCourierCapacity() {
    const profiles = await this.db.courierProfile.findMany({
      where: { user: { roleId: "COURIER" } },
      include: {
        user: { select: { id: true, fullName: true } },
        assignments: {
          where: activeAssignment,
          orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ userId: "asc" }],
    });

    return courierCapacityPageSchema.parse({
      items: profiles.map((profile) => ({
        courierUserId: profile.user.id,
        fullName: profile.user.fullName ?? "",
        onDuty: profile.onDuty,
        maxCapacity: profile.maxCapacity,
        currentWorkload: profile.currentWorkload,
        availableCapacity: Math.max(
          0,
          profile.maxCapacity - profile.currentWorkload,
        ),
        utilizationPercent:
          profile.maxCapacity === 0
            ? 100
            : Math.min(
                100,
                Math.round(
                  (profile.currentWorkload / profile.maxCapacity) * 1000,
                ) / 10,
              ),
        assignments: profile.assignments.map((assignment) =>
          courierAssignmentSchema.parse({
            id: assignment.id,
            parcelId: assignment.parcelId,
            courierUserId: profile.user.id,
            status: assignment.status,
            assignedAt: assignment.assignedAt.toISOString(),
            releasedAt: assignment.releasedAt?.toISOString() ?? null,
          }),
        ),
      })),
    });
  }

  async listAssignments(
    input: DispatchAssignmentQuery,
    options: { activeOnly?: boolean } = {},
  ) {
    const status =
      input.status ?? (options.activeOnly === false ? undefined : "ACTIVE");
    const where = {
      ...(status ? { status } : {}),
      ...(input.courierUserId
        ? { courierProfile: { userId: input.courierUserId } }
        : {}),
      ...(input.search
        ? {
            OR: [
              {
                parcel: {
                  trackingNumber: {
                    contains: input.search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                courierProfile: {
                  user: {
                    fullName: {
                      contains: input.search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [totalItems, assignments] = await Promise.all([
      this.db.courierAssignment.count({ where }),
      this.db.courierAssignment.findMany({
        where,
        include: {
          courierProfile: { include: { user: { select: { fullName: true } } } },
          parcel: {
            include: {
              originZone: { select: { town: true } },
              destinationZone: { select: { town: true } },
              quote: { select: { weightGrams: true } },
            },
          },
        },
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
    ]);
    return dispatchAssignmentPageSchema.parse({
      items: assignments.map((assignment) =>
        this.assignmentRecord(assignment),
      ),
      page: input.page,
      limit: input.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / input.limit),
    });
  }

  async getParcelAssignment(parcelId: string) {
    const parcel = await this.db.parcel.findUnique({
      where: { id: parcelId },
      include: {
        originZone: { select: { town: true } },
        destinationZone: { select: { town: true } },
        quote: { select: { weightGrams: true } },
        assignments: {
          where: activeAssignment,
          include: {
            courierProfile: {
              include: { user: { select: { fullName: true } } },
            },
          },
          orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    if (!parcel)
      throw new HttpError(404, "PARCEL_NOT_FOUND", "Parcel not found.");
    const current = parcel.assignments[0] ?? null;
    return dispatchParcelAssignmentSchema.parse({
      parcel: queueItem(parcel),
      assignment: current
        ? this.assignmentRecord({ ...current, parcel })
        : null,
    });
  }

  async getAssignment(assignmentId: string) {
    const assignment = await this.db.courierAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        courierProfile: { include: { user: { select: { fullName: true } } } },
        parcel: {
          include: {
            originZone: { select: { town: true } },
            destinationZone: { select: { town: true } },
            quote: { select: { weightGrams: true } },
          },
        },
      },
    });
    if (!assignment)
      throw new HttpError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    return this.assignmentRecord(assignment);
  }

  async assign(
    parcelId: string,
    input: CourierAssignmentInput,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM parcels WHERE id = ${parcelId}::uuid FOR UPDATE`;
          const parcel = await tx.parcel.findUnique({
            where: { id: parcelId },
            select: {
              id: true,
              status: true,
              version: true,
              dispatchVersion: true,
              assignments: {
                where: activeAssignment,
                select: {
                  id: true,
                  courierProfileId: true,
                  parcelId: true,
                  status: true,
                  assignedAt: true,
                  releasedAt: true,
                },
              },
            },
          });
          if (!parcel)
            throw new HttpError(404, "PARCEL_NOT_FOUND", "Parcel not found.");
          if (parcel.dispatchVersion !== input.dispatchVersion)
            throw new HttpError(
              409,
              "VERSION_CONFLICT",
              "This parcel was modified by someone else. Reload and retry.",
            );
          if (parcel.status !== "CREATED")
            throw new HttpError(
              409,
              "ASSIGNMENT_NOT_ALLOWED",
              "Only created parcels can be assigned.",
            );

          const target = await tx.courierProfile.findUnique({
            where: { userId: input.courierUserId },
            select: {
              id: true,
              userId: true,
              onDuty: true,
              maxCapacity: true,
              currentWorkload: true,
              user: { select: { roleId: true, status: true } },
            },
          });
          if (!target || target.user.roleId !== "COURIER")
            throw new HttpError(
              404,
              "COURIER_NOT_FOUND",
              "Courier profile not found.",
            );

          const current = parcel.assignments[0] ?? null;
          const profileIds = [target.id, ...(current ? [current.courierProfileId] : [])]
            .filter((id, index, ids) => ids.indexOf(id) === index)
            .sort();
          for (const profileId of profileIds)
            await tx.$queryRaw`SELECT id FROM courier_profiles WHERE id = ${profileId}::uuid FOR UPDATE`;

          const lockedTarget = await tx.courierProfile.findUniqueOrThrow({
            where: { id: target.id },
            select: {
              id: true,
              userId: true,
              onDuty: true,
              maxCapacity: true,
              currentWorkload: true,
              user: { select: { roleId: true, status: true } },
            },
          });
          if (lockedTarget.user.status !== "ACTIVE" || !lockedTarget.onDuty)
            throw new HttpError(
              409,
              "COURIER_UNAVAILABLE",
              "The courier is not active and on duty.",
            );

          if (current?.courierProfileId === lockedTarget.id)
            return courierAssignmentSchema.parse({
              id: current.id,
              parcelId: current.parcelId,
              courierUserId: lockedTarget.userId,
              dispatchVersion: parcel.dispatchVersion,
              status: current.status,
              assignedAt: current.assignedAt.toISOString(),
              releasedAt: current.releasedAt?.toISOString() ?? null,
            });

          if (lockedTarget.currentWorkload >= lockedTarget.maxCapacity)
            throw new HttpError(
              409,
              "COURIER_CAPACITY_EXCEEDED",
              "The courier has no reserved capacity for this parcel.",
            );

          if (current) {
            await tx.courierAssignment.update({
              where: { id: current.id },
              data: { status: "RELEASED", releasedAt: new Date() },
            });
            await tx.courierProfile.update({
              where: { id: current.courierProfileId },
              data: { currentWorkload: { decrement: 1 } },
            });
          }

          const created = await tx.courierAssignment.create({
            data: {
              parcelId,
              courierProfileId: lockedTarget.id,
            },
          });
          await tx.courierProfile.update({
            where: { id: lockedTarget.id },
            data: { currentWorkload: { increment: 1 } },
          });
          const updatedParcel = await tx.parcel.update({
            where: { id: parcel.id },
            data: { dispatchVersion: { increment: 1 } },
            select: { dispatchVersion: true },
          });

          return courierAssignmentSchema.parse({
            id: created.id,
            parcelId: created.parcelId,
            courierUserId: lockedTarget.userId,
            dispatchVersion: updatedParcel.dispatchVersion,
            status: created.status,
            assignedAt: created.assignedAt.toISOString(),
            releasedAt: created.releasedAt?.toISOString() ?? null,
          });
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
          "ASSIGNMENT_BUSY",
          "This assignment changed at the same time. Retry.",
        );
      throw error;
    }
  }
}
