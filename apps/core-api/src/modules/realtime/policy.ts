import type { PublicUser } from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";

export interface RealtimeAccessPolicy {
  canJoinPrivate(user: PublicUser, parcelId: string): Promise<boolean>;
}

/** Courier ownership is checked against the current, unreleased M06 assignment. */
export interface CourierParcelAccess {
  canAccess(courierUserId: number, parcelId: string): Promise<boolean>;
}

export class PrismaRealtimeAccessPolicy implements RealtimeAccessPolicy {
  constructor(
    private readonly db: Database,
    private readonly courierAccess?: CourierParcelAccess,
  ) {}

  async canJoinPrivate(user: PublicUser, parcelId: string) {
    if (user.role === "COURIER") {
      if (this.courierAccess)
        return this.courierAccess.canAccess(user.id, parcelId);
      return Boolean(
        await this.db.parcel.findFirst({
          where: {
            id: parcelId,
            assignment: { is: { courierId: user.id, releasedAt: null } },
          },
          select: { id: true },
        }),
      );
    }

    const ownership =
      user.role === "CUSTOMER"
        ? { userId: user.id }
        : user.role === "MERCHANT"
          ? {
              merchant: {
                is: { userId: user.id, status: "APPROVED" as const },
              },
            }
          : user.role === "ADMIN" || user.role === "DISPATCHER"
            ? {}
            : { id: "00000000-0000-0000-0000-000000000000" };
    const parcel = await this.db.parcel.findFirst({
      where: { id: parcelId, ...ownership },
      select: { id: true },
    });
    return Boolean(parcel);
  }
}
