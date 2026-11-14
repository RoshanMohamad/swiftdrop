import { Prisma, type Database } from "@swiftdrop/db";
import type { NotificationChannel, NotificationProgress } from "./types.js";

const CONSUMER = "notification-svc";

export type ProcessedEventClaim =
  | { outcome: "acquired"; leaseExpiresAt: Date }
  | { outcome: "busy"; leaseExpiresAt: Date | null }
  | { outcome: "done" };

export interface ProcessedEventStore {
  claim(input: {
    consumer: string;
    eventId: string;
    leaseMs: number;
  }): Promise<ProcessedEventClaim>;
  markDone(input: {
    consumer: string;
    eventId: string;
    leaseExpiresAt: Date;
  }): Promise<boolean>;
  markFailed(input: {
    consumer: string;
    eventId: string;
    leaseExpiresAt: Date;
  }): Promise<{ updated: boolean; attempts: number }>;
}

export interface NotificationLogStore {
  wasSent(eventId: string, channel: NotificationChannel): Promise<boolean>;
  append(input: {
    eventId: string;
    channel: NotificationChannel;
    templateId: string;
    /** Must be produced by the notification masking boundary, never raw contact data. */
    recipientMasked: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    providerMessageId?: string;
    errorMessage?: string;
  }): Promise<void>;
}

type Clock = () => Date;

function sanitizedErrorMessage(value?: string) {
  if (!value) return null;
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : "NOTIFICATION_FAILED";
}

export class PrismaProcessedEventStore implements ProcessedEventStore {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async claim(input: {
    consumer: string;
    eventId: string;
    leaseMs: number;
  }): Promise<ProcessedEventClaim> {
    const now = this.clock();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    const rows = await this.db.$queryRaw<Array<{ lease_expires_at: Date }>>(
      Prisma.sql`
        INSERT INTO processed_events
          (id, consumer, event_id, status, attempts, lease_expires_at, created_at)
        VALUES
          (gen_random_uuid(), ${input.consumer}, ${input.eventId}::uuid, 'PROCESSING', 0, ${leaseExpiresAt}, ${now})
        ON CONFLICT (consumer, event_id) DO UPDATE
          SET status = 'PROCESSING',
              lease_expires_at = EXCLUDED.lease_expires_at,
              completed_at = NULL
        WHERE processed_events.status <> 'DONE'
          AND (processed_events.lease_expires_at IS NULL
            OR processed_events.lease_expires_at <= ${now})
        RETURNING lease_expires_at
      `,
    );
    if (rows[0]) {
      return {
        outcome: "acquired",
        leaseExpiresAt: rows[0].lease_expires_at,
      };
    }

    const current = await this.db.processedEvent.findUnique({
      where: {
        consumer_eventId: {
          consumer: input.consumer,
          eventId: input.eventId,
        },
      },
      select: { status: true, leaseExpiresAt: true },
    });
    if (current?.status === "DONE") return { outcome: "done" };
    return {
      outcome: "busy",
      leaseExpiresAt: current?.leaseExpiresAt ?? null,
    };
  }

  async markDone(input: {
    consumer: string;
    eventId: string;
    leaseExpiresAt: Date;
  }) {
    const result = await this.db.processedEvent.updateMany({
      where: {
        consumer: input.consumer,
        eventId: input.eventId,
        status: "PROCESSING",
        leaseExpiresAt: input.leaseExpiresAt,
      },
      data: {
        status: "DONE",
        completedAt: this.clock(),
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async markFailed(input: {
    consumer: string;
    eventId: string;
    leaseExpiresAt: Date;
  }) {
    // FAILED has no active lease, so the next delivery may retry immediately.
    const rows = await this.db.$queryRaw<Array<{ attempts: number }>>(
      Prisma.sql`
        UPDATE processed_events
        SET status = 'FAILED',
            attempts = attempts + 1,
            lease_expires_at = NULL
        WHERE consumer = ${input.consumer}
          AND event_id = ${input.eventId}::uuid
          AND status = 'PROCESSING'
          AND lease_expires_at = ${input.leaseExpiresAt}
        RETURNING attempts
      `,
    );
    return rows[0]
      ? { updated: true, attempts: rows[0].attempts }
      : { updated: false, attempts: 0 };
  }
}

export class PrismaNotificationLogStore implements NotificationLogStore {
  constructor(private readonly db: Database) {}

  async wasSent(eventId: string, channel: NotificationChannel) {
    return Boolean(
      await this.db.notificationLog.findFirst({
        where: { eventId, channel, status: "SENT" },
        select: { id: true },
      }),
    );
  }

  async append(input: {
    eventId: string;
    channel: NotificationChannel;
    templateId: string;
    recipientMasked: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    providerMessageId?: string;
    errorMessage?: string;
  }) {
    if (!input.recipientMasked.includes("***")) {
      throw new Error("Notification logs require a masked recipient.");
    }
    const existing = await this.db.notificationLog.findFirst({
      where: { eventId: input.eventId, channel: input.channel },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const data = {
      templateId: input.templateId,
      recipientMasked: input.recipientMasked,
      status: input.status,
      providerMsgId: input.providerMessageId ?? null,
      errorMsg: sanitizedErrorMessage(input.errorMessage),
      sentAt: input.status === "SENT" ? new Date() : null,
    };
    if (existing) {
      await this.db.notificationLog.update({
        where: { id: existing.id },
        data,
      });
      return;
    }
    await this.db.notificationLog.create({
      data: { eventId: input.eventId, channel: input.channel, ...data },
    });
  }
}

export class PrismaNotificationProgress implements NotificationProgress {
  private readonly claims = new Map<string, Date>();
  private readonly processedEvents: ProcessedEventStore;
  private readonly notificationLogs: NotificationLogStore;

  constructor(
    db: Database,
    private readonly leaseMs = 60_000,
    processedEvents: ProcessedEventStore = new PrismaProcessedEventStore(db),
    notificationLogs: NotificationLogStore = new PrismaNotificationLogStore(db),
  ) {
    this.processedEvents = processedEvents;
    this.notificationLogs = notificationLogs;
  }

  async acquire(eventId: string) {
    const claim = await this.processedEvents.claim({
      consumer: CONSUMER,
      eventId,
      leaseMs: this.leaseMs,
    });
    if (claim.outcome === "acquired") {
      this.claims.set(eventId, claim.leaseExpiresAt);
      return "acquired" as const;
    }
    return claim.outcome;
  }

  async wasSent(eventId: string, channel: NotificationChannel) {
    return this.notificationLogs.wasSent(eventId, channel);
  }

  async record(input: {
    eventId: string;
    channel: NotificationChannel;
    templateId: string;
    recipientMasked: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    providerMessageId?: string;
    errorMessage?: string;
  }) {
    await this.notificationLogs.append(input);
  }

  async complete(eventId: string) {
    const leaseExpiresAt = this.requireClaim(eventId);
    const completed = await this.processedEvents.markDone({
      consumer: CONSUMER,
      eventId,
      leaseExpiresAt,
    });
    this.claims.delete(eventId);
    if (!completed) throw new Error("Notification event lease was lost.");
  }

  async fail(eventId: string) {
    const leaseExpiresAt = this.requireClaim(eventId);
    const failed = await this.processedEvents.markFailed({
      consumer: CONSUMER,
      eventId,
      leaseExpiresAt,
    });
    this.claims.delete(eventId);
    if (!failed.updated) throw new Error("Notification event lease was lost.");
    return failed.attempts;
  }

  private requireClaim(eventId: string) {
    const leaseExpiresAt = this.claims.get(eventId);
    if (!leaseExpiresAt) throw new Error("Notification event is not claimed.");
    return leaseExpiresAt;
  }
}
