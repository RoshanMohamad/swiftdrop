import type { PublicUser } from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";

export interface RealtimeAccessPolicy {
  canJoinPrivate(user: PublicUser, parcelId: string): Promise<boolean>;
}

/**
 * M06 owns the courier-assignment read model (X-08). Keeping that lookup behind
 * this narrow interface lets FR-I6 deny courier access safely until M06 supplies
 * a database-backed implementation, without guessing a table or trusting event state.
 */
export interface CourierParcelAccess {
  canAccess(courierUserId: number, parcelId: string): Promise<boolean>;
}

const denyCourierAccess: CourierParcelAccess = {
  canAccess: async () => false,
};

export class PrismaRealtimeAccessPolicy implements RealtimeAccessPolicy {
  constructor(
    private readonly db: Database,
    private readonly courierAccess: CourierParcelAccess = denyCourierAccess,
  ) {}

  async canJoinPrivate(user: PublicUser, parcelId: string) {
    if (user.role === "COURIER")
      return this.courierAccess.canAccess(user.id, parcelId);

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
