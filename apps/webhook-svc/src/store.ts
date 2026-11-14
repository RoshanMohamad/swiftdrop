import { Prisma, type Database } from "@swiftdrop/db";
import { eventEnvelopeSchema } from "@swiftdrop/contracts";
import type {
  Claim,
  DeliveryRecord,
  DeliveryStatus,
  DeliveryStore,
} from "./processor.js";

type Row = {
  id: string;
  eventId: string;
  merchantId: number;
  eventType: string;
  envelope: Prisma.JsonValue;
  status: DeliveryStatus;
  currentRun: number;
};
const record = (row: Row): DeliveryRecord => ({
  id: row.id,
  eventId: row.eventId,
  merchantId: row.merchantId,
  eventType: row.eventType,
  envelope: eventEnvelopeSchema.parse(row.envelope),
  status: row.status,
  currentRun: row.currentRun,
});

export class PrismaDeliveryStore implements DeliveryStore {
  constructor(private db: Database) {}

  async ensureDelivery(input: Parameters<DeliveryStore["ensureDelivery"]>[0]) {
    // createMany + skipDuplicates is race-free where upsert is not: concurrent first
    // deliveries of the same event converge on one row.
    await this.db.webhookDelivery.createMany({
      data: [
        {
          eventId: input.eventId,
          merchantId: input.merchantId,
          eventType: input.eventType,
          envelope: input.envelope as Prisma.InputJsonObject,
        },
      ],
      skipDuplicates: true,
    });
    return record(
      await this.db.webhookDelivery.findUniqueOrThrow({
        where: {
          eventId_merchantId: {
            eventId: input.eventId,
            merchantId: input.merchantId,
          },
        },
      }),
    );
  }

  async findDelivery(id: string) {
    const row = await this.db.webhookDelivery.findUnique({ where: { id } });
    return row ? record(row) : null;
  }

  async claimAttempt(
    input: Parameters<DeliveryStore["claimAttempt"]>[0],
  ): Promise<Claim> {
    const leaseUntil = new Date(input.now.getTime() + input.leaseMs);
    try {
      const created = await this.db.webhookAttempt.create({
        data: {
          deliveryId: input.deliveryId,
          runNumber: input.run,
          attempt: input.attempt,
          leaseUntil,
          startedAt: input.now,
        },
      });
      return { kind: "claimed", attemptId: String(created.id) };
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ))
        throw error;
    }
    const existing = await this.db.webhookAttempt.findUniqueOrThrow({
      where: {
        deliveryId_runNumber_attempt: {
          deliveryId: input.deliveryId,
          runNumber: input.run,
          attempt: input.attempt,
        },
      },
    });
    if (existing.state === "DONE")
      return {
        kind: "done",
        attempt: {
          id: String(existing.id),
          handoff: existing.handoff,
          handoffConfirmed: existing.handoffConfirmedAt !== null,
        },
      };
    // A redelivered message means the consumer that held the claim is gone; an expired lease
    // means the same. A live lease on a non-redelivered duplicate belongs to someone else.
    if (input.takeover || existing.leaseUntil <= input.now) {
      const taken = await this.db.webhookAttempt.updateMany({
        where: { id: existing.id, state: "CLAIMED" },
        data: { leaseUntil, startedAt: input.now },
      });
      if (taken.count)
        return { kind: "claimed", attemptId: String(existing.id) };
    }
    return { kind: "busy" };
  }

  async completeAttempt(
    input: Parameters<DeliveryStore["completeAttempt"]>[0],
  ) {
    const finished = input.deliveryStatus === "PENDING" ? null : input.now;
    await this.db.$transaction([
      this.db.webhookAttempt.update({
        where: { id: BigInt(input.attemptId) },
        data: {
          state: "DONE",
          outcome: input.outcome,
          statusCode: input.statusCode,
          latencyMs: input.latencyMs,
          errorCode: input.errorCode,
          handoff: input.handoff,
          nextRetryAt: input.nextRetryAt,
          finishedAt: input.now,
          // Nothing to hand off means nothing to confirm.
          handoffConfirmedAt: input.handoff === "NONE" ? input.now : null,
        },
      }),
      this.db.webhookDelivery.update({
        where: { id: input.deliveryId },
        data: { status: input.deliveryStatus, completedAt: finished },
      }),
    ]);
  }

  async confirmHandoff(attemptId: string, now: Date) {
    await this.db.webhookAttempt.update({
      where: { id: BigInt(attemptId) },
      data: { handoffConfirmedAt: now },
    });
  }
}
