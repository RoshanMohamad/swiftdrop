import type { PublicUser } from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";

export interface RealtimeAccessPolicy {
  canJoinPrivate(user: PublicUser, parcelId: string): Promise<boolean>;
}

export class PrismaRealtimeAccessPolicy implements RealtimeAccessPolicy {
  constructor(private readonly db: Database) {}

  async canJoinPrivate(user: PublicUser, parcelId: string) {
    const parcel = await this.db.parcel.findFirst({
      where: {
        id: parcelId,
        ...(user.role === "CUSTOMER" || user.role === "MERCHANT"
          ? { userId: user.id }
          : user.role === "ADMIN" || user.role === "DISPATCHER"
            ? {}
            : { id: "00000000-0000-0000-0000-000000000000" }),
      },
      select: { id: true },
    });
    // Courier assignment authorization is added through this interface when M06 lands X-08.
    return Boolean(parcel);
  }
}
