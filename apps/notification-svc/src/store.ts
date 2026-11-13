import { Prisma, type Database } from "@swiftdrop/db";
import type { NotificationChannel, NotificationProgress } from "./types.js";

const CONSUMER = "notification-svc";

export class PrismaNotificationProgress implements NotificationProgress {
  constructor(
    private readonly db: Database,
    private readonly leaseMs = 60_000,
  ) {}

  async acquire(eventId: string) {
    const leaseExpiresAt = new Date(Date.now() + this.leaseMs);
    const rows = await this.db.$queryRaw<Array<{ event_id: string }>>(
      Prisma.sql`
        INSERT INTO processed_events
          (id, consumer, event_id, status, attempts, lease_expires_at, created_at)
        VALUES
          (gen_random_uuid(), ${CONSUMER}, ${eventId}::uuid, 'PROCESSING', 0, ${leaseExpiresAt}, CURRENT_TIMESTAMP)
        ON CONFLICT (consumer, event_id) DO UPDATE
          SET status = 'PROCESSING', lease_expires_at = EXCLUDED.lease_expires_at
        WHERE processed_events.status <> 'DONE'
          AND (processed_events.lease_expires_at IS NULL
            OR processed_events.lease_expires_at <= CURRENT_TIMESTAMP)
        RETURNING event_id
      `,
    );
    if (rows.length) return "acquired" as const;
    const current = await this.db.processedEvent.findUnique({
      where: { consumer_eventId: { consumer: CONSUMER, eventId } },
      select: { status: true },
    });
    return current?.status === "DONE" ? ("done" as const) : ("busy" as const);
  }

  async wasSent(eventId: string, channel: NotificationChannel) {
    return Boolean(
      await this.db.notificationLog.findFirst({
        where: { eventId, channel, status: "SENT" },
        select: { id: true },
      }),
    );
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
    await this.db.notificationLog.create({
      data: {
        eventId: input.eventId,
        channel: input.channel,
        templateId: input.templateId,
        recipientMasked: input.recipientMasked,
        status: input.status,
        providerMsgId: input.providerMessageId,
        errorMsg: input.errorMessage,
        sentAt: input.status === "SENT" ? new Date() : undefined,
      },
    });
  }

  async complete(eventId: string) {
    await this.db.processedEvent.update({
      where: { consumer_eventId: { consumer: CONSUMER, eventId } },
      data: {
        status: "DONE",
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
  }

  async fail(eventId: string) {
    const failed = await this.db.processedEvent.update({
      where: { consumer_eventId: { consumer: CONSUMER, eventId } },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        leaseExpiresAt: null,
      },
      select: { attempts: true },
    });
    return failed.attempts;
  }
}
