import { Prisma, type Database } from "@swiftdrop/db";
import {
  WEBHOOK_REPLAY_EVENT,
  type WebhookDelivery,
  type WebhookDeliveryDetail,
  type WebhookDeliveryStatus,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import { outbox } from "../../shared/outbox/index.js";

const iso = (date: Date) => date.toISOString();
const notFound = () =>
  new HttpError(404, "NOT_FOUND", "No webhook delivery was found.");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Prisma.WebhookDeliveryGetPayload<{
  include: { attempts: { select: { errorCode: true } } };
}>;
const summary = (row: Row): WebhookDelivery => ({
  id: row.id,
  eventId: row.eventId,
  eventType: row.eventType,
  merchantId: row.merchantId,
  status: row.status,
  currentRun: row.currentRun,
  lastErrorCode: row.attempts[0]?.errorCode ?? null,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/**
 * Delivery log and audited replay (FR-I5). The log is read by the Admin console; M02 mounts
 * the same `list({ merchantId })` behind merchant-scoped authorisation for the merchant
 * dashboard (plan X-10). Never returns URLs, secrets, payloads or contact data.
 */
export class WebhooksService {
  constructor(private db: Database) {}

  async list(filters: {
    status?: WebhookDeliveryStatus;
    merchantId?: number;
    cursor?: string;
    limit?: number;
  }) {
    const limit = filters.limit ?? 25;
    let after: { createdAt: Date; id: string } | undefined;
    if (filters.cursor) {
      try {
        const [time, id] = Buffer.from(filters.cursor, "base64url")
          .toString("utf8")
          .split("|");
        after = { createdAt: new Date(time!), id: id! };
        if (Number.isNaN(after.createdAt.getTime()) || !UUID.test(after.id))
          throw new Error();
      } catch {
        throw new HttpError(400, "CURSOR", "The page cursor is invalid.");
      }
    }
    const rows = await this.db.webhookDelivery.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.merchantId ? { merchantId: filters.merchantId } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        attempts: {
          select: { errorCode: true },
          orderBy: { id: "desc" },
          take: 1,
        },
      },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(summary),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(`${iso(last.createdAt)}|${last.id}`).toString(
              "base64url",
            )
          : null,
    };
  }

  async detail(id: string): Promise<WebhookDeliveryDetail> {
    if (!UUID.test(id)) throw notFound();
    const row = await this.db.webhookDelivery.findUnique({
      where: { id },
      include: {
        attempts: { orderBy: [{ runNumber: "asc" }, { attempt: "asc" }] },
        replays: { orderBy: { runNumber: "asc" } },
      },
    });
    if (!row) throw notFound();
    const latest = [...row.attempts].reverse().find((a) => a.errorCode);
    return {
      ...summary({
        ...row,
        attempts: [{ errorCode: latest?.errorCode ?? null }],
      }),
      attempts: row.attempts.map((a) => ({
        runNumber: a.runNumber,
        attempt: a.attempt,
        outcome: a.outcome,
        statusCode: a.statusCode,
        latencyMs: a.latencyMs,
        errorCode: a.errorCode,
        nextRetryAt: a.nextRetryAt ? iso(a.nextRetryAt) : null,
        startedAt: iso(a.startedAt),
      })),
      replays: row.replays.map((r) => ({
        runNumber: r.runNumber,
        requestedByUserId: r.requestedByUserId,
        reason: r.reason,
        createdAt: iso(r.createdAt),
      })),
    };
  }

  /**
   * Start a new run of a FAILED delivery. The audit row, the status change and the outbox
   * request commit together; the relay then routes the request to webhooks.q only. The row
   * lock makes a double click or two admins produce exactly one run (the loser gets 409).
   */
  async replay(adminId: number, id: string, reason: string) {
    if (!UUID.test(id)) throw notFound();
    return this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        Array<{ status: WebhookDeliveryStatus; current_run: number }>
      >(
        Prisma.sql`SELECT status, current_run FROM webhook_deliveries WHERE id = ${id}::uuid FOR UPDATE`,
      );
      if (!locked) throw notFound();
      if (locked.status !== "FAILED")
        throw new HttpError(
          409,
          "REPLAY_NOT_ALLOWED",
          "Only failed deliveries can be replayed, and only once at a time.",
        );
      const runNumber = locked.current_run + 1;
      await tx.webhookReplay.create({
        data: { deliveryId: id, runNumber, requestedByUserId: adminId, reason },
      });
      await tx.webhookDelivery.update({
        where: { id },
        data: { status: "PENDING", currentRun: runNumber, completedAt: null },
      });
      await outbox.add(tx, {
        type: WEBHOOK_REPLAY_EVENT,
        aggregateId: id,
        sequence: runNumber,
        data: { deliveryId: id, runNumber },
      });
      return { deliveryId: id, runNumber, status: "PENDING" as const };
    });
  }
}
