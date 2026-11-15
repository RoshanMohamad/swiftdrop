import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Database } from "@swiftdrop/db";
import {
  type CourierJobs,
  type CourierStatusResult,
  type CourierStatusUpdate,
  type CourierSummary,
  type ParcelStatus,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import type { LifecycleService } from "../lifecycle/index.js";
import { lockCourierRows } from "../dispatch/index.js";
import type { ProofStorage } from "./storage.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE: ParcelStatus[] = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "FAILED",
];
const notFound = () =>
  new HttpError(404, "NOT_FOUND", "This job was not found.");

/** Magic-number check so a renamed file cannot be stored as a "photo". */
export function sniffImage(data: Buffer): "image/jpeg" | "image/png" | null {
  if (
    data.length > 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return "image/jpeg";
  if (
    data.length > 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  return null;
}

/**
 * Courier delivery backend (FR-K1, FR-K2). Every parcel read and write is scoped to the
 * courier's own unreleased assignment, so another courier's parcel is a 404. Status changes
 * go through LifecycleService (the only writer of parcels.status/version/attempt_count) and
 * record a ledger row in the same transaction, which makes offline replays exactly-once.
 */
export class CourierService {
  constructor(
    private db: Database,
    private lifecycle: LifecycleService,
    private storage: ProofStorage,
  ) {}

  private summary(
    courierId: number,
    profile: { onDuty: boolean; capacity: number; workload: number } | null,
    fullName: string | null,
  ): CourierSummary {
    return {
      userId: courierId,
      fullName,
      onDuty: profile?.onDuty ?? false,
      capacity: profile?.capacity ?? 10,
      workload: profile?.workload ?? 0,
      hasProfile: profile !== null,
    };
  }

  async profile(courierId: number): Promise<CourierSummary> {
    const user = await this.db.user.findUnique({
      where: { id: courierId },
      select: { fullName: true, courierProfile: true },
    });
    return this.summary(
      courierId,
      user?.courierProfile ?? null,
      user?.fullName ?? null,
    );
  }

  /** FR-K1: only parcels currently assigned to this courier. */
  async jobs(courierId: number): Promise<CourierJobs> {
    const [profile, rows] = await Promise.all([
      this.profile(courierId),
      this.db.parcelAssignment.findMany({
        where: {
          courierId,
          releasedAt: null,
          parcel: { status: { in: ACTIVE } },
        },
        orderBy: [{ assignedAt: "asc" }, { parcelId: "asc" }],
        take: 200,
        select: {
          assignedAt: true,
          parcel: {
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              version: true,
              attemptCount: true,
              recipientName: true,
              recipientPhone: true,
              recipientAddress: true,
              originZone: { select: { town: true } },
              destinationZone: { select: { town: true } },
            },
          },
        },
      }),
    ]);
    return {
      profile,
      items: rows.map(({ assignedAt, parcel }) => ({
        id: parcel.id,
        trackingNumber: parcel.trackingNumber,
        status: parcel.status,
        version: parcel.version,
        attemptCount: parcel.attemptCount,
        originTown: parcel.originZone.town,
        destinationTown: parcel.destinationZone.town,
        recipientName: parcel.recipientName,
        recipientPhone: parcel.recipientPhone,
        recipientAddress: parcel.recipientAddress,
        assignedAt: assignedAt.toISOString(),
      })),
    };
  }

  /** Duty changes take the same courier row lock as assignment (plan X-07). */
  async setDuty(courierId: number, onDuty: boolean): Promise<CourierSummary> {
    const user = await this.db.user.findUnique({
      where: { id: courierId },
      select: { fullName: true },
    });
    return this.db.$transaction(async (tx) => {
      await lockCourierRows(tx, [courierId]);
      const exists = await tx.courierProfile.findUnique({
        where: { userId: courierId },
      });
      if (!exists)
        throw new HttpError(
          409,
          "PROFILE_PENDING",
          "Your courier profile is not set up yet. Ask a dispatcher.",
        );
      const profile = await tx.courierProfile.update({
        where: { userId: courierId },
        data: { onDuty },
      });
      return this.summary(courierId, profile, user?.fullName ?? null);
    });
  }

  private async ownedParcel(courierId: number, parcelId: string) {
    if (!UUID.test(parcelId)) throw notFound();
    const assignment = await this.db.parcelAssignment.findFirst({
      where: { parcelId, courierId, releasedAt: null },
      select: { parcel: { select: { status: true } } },
    });
    if (!assignment) throw notFound();
    return assignment.parcel;
  }

  /** FR-K2: store a private proof photo; the key is later attached to the DELIVERED update. */
  async uploadProof(
    courierId: number,
    parcelId: string,
    data: Buffer,
    declaredType: string | undefined,
  ) {
    await this.ownedParcel(courierId, parcelId);
    const type = sniffImage(data);
    if (!type || type !== declaredType)
      throw new HttpError(
        415,
        "UNSUPPORTED_IMAGE",
        "Upload a JPEG or PNG photo.",
      );
    const key = `proofs/${parcelId}/${randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
    await this.storage.put(key, data, type);
    return { proofObjectKey: key };
  }

  /**
   * FR-K2/K3: apply one courier status update under a stable operation key. A repeat of the same
   * key and body returns the stored result (replayed); the same key with a different body is a
   * conflict. Version conflicts (404/409) are returned unchanged so an offline client can pause
   * for review instead of overwriting newer server state.
   */
  async updateStatus(
    courierId: number,
    parcelId: string,
    operationKey: string,
    body: CourierStatusUpdate,
  ): Promise<CourierStatusResult> {
    const requestHash = createHash("sha256")
      .update(JSON.stringify([parcelId, body]))
      .digest("hex");
    const replay = await this.findReplay(courierId, operationKey, requestHash);
    if (replay) return replay;

    const parcel = await this.ownedParcel(courierId, parcelId);
    if (parcel.status === "FAILED" && body.to === "OUT_FOR_DELIVERY")
      throw new HttpError(
        409,
        "REATTEMPT_REQUIRES_DISPATCH",
        "A dispatcher must schedule the re-attempt for a failed delivery.",
      );
    if (
      body.proofObjectKey &&
      (!body.proofObjectKey.startsWith(`proofs/${parcelId}/`) ||
        !(await this.storage.exists(body.proofObjectKey)))
    )
      throw new HttpError(
        409,
        "PROOF_NOT_FOUND",
        "The delivery photo was not uploaded. Upload it again.",
      );

    try {
      const result = await this.lifecycle.transition(
        parcelId,
        body.to,
        body.town,
        body.version,
        async (tx, applied) => {
          await tx.courierOperation.create({
            data: {
              courierId,
              operationKey,
              requestHash,
              parcelId,
              toStatus: body.to,
              receivedBy: body.receivedBy ?? null,
              failureReason: body.failureReason ?? null,
              proofObjectKey: body.proofObjectKey ?? null,
              response: applied,
            },
          });
        },
      );
      return { ...result, replayed: false };
    } catch (error) {
      // A concurrent request with the same key may have won the race: return its result.
      const raced =
        (error instanceof HttpError && error.status === 409) ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002");
      if (raced) {
        const existing = await this.findReplay(
          courierId,
          operationKey,
          requestHash,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async findReplay(
    courierId: number,
    operationKey: string,
    requestHash: string,
  ): Promise<CourierStatusResult | null> {
    const row = await this.db.courierOperation.findUnique({
      where: { courierId_operationKey: { courierId, operationKey } },
    });
    if (!row) return null;
    if (row.requestHash !== requestHash)
      throw new HttpError(
        409,
        "OPERATION_KEY_REUSED",
        "This operation key was already used for a different update.",
      );
    const response = row.response as {
      status?: ParcelStatus;
      version?: number;
      attemptCount?: number;
    };
    return {
      status: response.status as ParcelStatus,
      version: response.version as number,
      attemptCount: response.attemptCount ?? 0,
      replayed: true,
    };
  }
}
