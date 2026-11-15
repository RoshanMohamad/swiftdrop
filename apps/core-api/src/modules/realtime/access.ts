import type { Database } from "@swiftdrop/db";
import type { ParcelSnapshot, Role } from "@swiftdrop/contracts";

export interface RealtimeUser {
  id: number;
  role: Role;
}

/**
 * Current authorisation for a private room, evaluated in the database at join time. Anything not
 * allowed returns null, which the gateway reports exactly like a missing parcel (no leak).
 * The snapshot doubles as the authorised reconnect snapshot, so a client that missed events
 * while disconnected resynchronises without trusting any buffered message.
 */
export class PrivateAccess {
  constructor(private db: Database) {}

  async snapshotFor(
    user: RealtimeUser,
    parcelId: string,
  ): Promise<ParcelSnapshot | null> {
    const parcel = await this.db.parcel.findUnique({
      where: { id: parcelId },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        version: true,
        userId: true,
        merchant: { select: { userId: true } },
        assignment: { select: { courierId: true, releasedAt: true } },
        history: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
          select: { status: true, town: true, createdAt: true },
        },
      },
    });
    if (!parcel) return null;
    const allowed =
      user.role === "ADMIN" ||
      user.role === "DISPATCHER" ||
      (user.role === "CUSTOMER" && parcel.userId === user.id) ||
      (user.role === "MERCHANT" && parcel.merchant?.userId === user.id) ||
      (user.role === "COURIER" &&
        parcel.assignment?.courierId === user.id &&
        parcel.assignment.releasedAt === null);
    if (!allowed) return null;
    return {
      parcelId: parcel.id,
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      version: parcel.version,
      history: parcel.history.map((item) => ({
        status: item.status,
        town: item.town,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
}
