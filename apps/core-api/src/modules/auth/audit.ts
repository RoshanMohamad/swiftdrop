import type { Database, Prisma } from "@swiftdrop/db";
import type { auditEventTypes } from "@swiftdrop/contracts";
import { currentCorrelationId } from "../../shared/correlation.js";

/**
 * The security audit trail (auth plan section 6): who did what to which account, whether it
 * worked, and under which request. It records facts, never secrets: metadata is limited to a
 * short allowlist of primitive keys, so a password, token, code or address can never be written
 * by accident. Rows are kept for AUDIT_RETENTION_DAYS and read only through the Admin endpoint.
 */
export type AuditEventType = (typeof auditEventTypes)[number];

const METADATA_KEYS = new Set(["reason", "method", "sessions", "role", "remaining"]);
type Primitive = string | number | boolean | null;

export type AuditInput = {
  type: AuditEventType;
  outcome: "SUCCESS" | "FAILURE";
  /** Who performed the action, when that is a signed-in user. */
  actorId?: number | null;
  /** Whose account it concerns (known even for a failed sign-in, unknown for a made-up email). */
  targetId?: number | null;
  metadata?: Record<string, Primitive>;
};

type Client = Pick<Database, "authAuditEvent"> | Pick<Prisma.TransactionClient, "authAuditEvent">;

export function safeMetadata(metadata: Record<string, Primitive> = {}) {
  const out: Record<string, Primitive> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!METADATA_KEYS.has(key)) continue;
    out[key] = typeof value === "string" ? value.slice(0, 64) : value;
  }
  return out;
}

/** Inside a transaction: the event commits with the change it describes, or neither does. */
export async function recordAudit(client: Client, input: AuditInput) {
  await client.authAuditEvent.create({
    data: {
      eventType: input.type,
      outcome: input.outcome,
      actorUserId: input.actorId ?? null,
      targetUserId: input.targetId ?? null,
      correlationId: currentCorrelationId() ?? null,
      metadata: safeMetadata(input.metadata),
    },
  });
}

/** For outcomes outside a transaction (a failed sign-in): a broken audit write never hides the 401. */
export async function tryRecordAudit(
  client: Client,
  input: AuditInput,
  onError?: () => void,
) {
  try {
    await recordAudit(client, input);
  } catch {
    onError?.();
  }
}

export type AuditQuery = {
  cursor?: string | undefined;
  limit?: number;
  eventType?: AuditEventType | undefined;
  userId?: number | undefined;
};

/** Newest first. The cursor is (occurred_at, id), the ordering keys, so pages are stable. */
export async function listAuditEvents(db: Database, query: AuditQuery) {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  let after: { at: Date; id: string } | undefined;
  if (query.cursor) {
    const [time, id] = Buffer.from(query.cursor, "base64url")
      .toString("utf8")
      .split("|");
    const at = new Date(time ?? "");
    if (Number.isNaN(at.getTime()) || !id || !/^[0-9a-f-]{36}$/i.test(id))
      throw new RangeError("Invalid cursor.");
    after = { at, id };
  }
  const rows = await db.authAuditEvent.findMany({
    where: {
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.userId
        ? { OR: [{ targetUserId: query.userId }, { actorUserId: query.userId }] }
        : {}),
      ...(after
        ? {
            AND: [
              {
                OR: [
                  { occurredAt: { lt: after.at } },
                  { occurredAt: after.at, id: { lt: after.id } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      eventType: row.eventType,
      outcome: row.outcome as "SUCCESS" | "FAILURE",
      actorUserId: row.actorUserId,
      targetUserId: row.targetUserId,
      correlationId: row.correlationId,
      metadata: row.metadata as Record<string, Primitive>,
    })),
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(`${last.occurredAt.toISOString()}|${last.id}`).toString(
            "base64url",
          )
        : null,
  };
}

/** Bounded retention: one batch per call, so a large backlog never holds a long lock. */
export async function cleanupAudit(
  db: Database,
  retentionDays: number,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const old = await db.authAuditEvent.findMany({
    where: { occurredAt: { lt: cutoff } },
    select: { id: true },
    take: 500,
  });
  if (old.length)
    await db.authAuditEvent.deleteMany({
      where: { id: { in: old.map(({ id }) => id) } },
    });
  return old.length;
}
