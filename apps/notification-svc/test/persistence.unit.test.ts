import { describe, expect, it } from "@jest/globals";
import type { Database } from "@swiftdrop/db";
import {
  PrismaNotificationLogStore,
  PrismaProcessedEventStore,
} from "../src/store.js";

type ProgressRow = {
  status: "PROCESSING" | "DONE" | "FAILED";
  leaseExpiresAt: Date | null;
  completedAt: Date | null;
  attempts: number;
};

type SqlQuery = { strings: readonly string[]; values: readonly unknown[] };

class PersistenceDatabaseHarness {
  readonly progress = new Map<string, ProgressRow>();
  readonly logs: Array<Record<string, unknown>> = [];

  readonly processedEvent: {
    findUnique: (args: {
      where: { consumer_eventId: { consumer: string; eventId: string } };
    }) => Promise<ProgressRow | null>;
  };

  constructor() {
    this.processedEvent = {
      findUnique: async (args) => {
        const { consumer, eventId } = args.where.consumer_eventId;
        return this.progress.get(this.key(consumer, eventId)) ?? null;
      },
    };
  }

  readonly notificationLog = {
    findFirst: async (args: {
      where: { eventId: string; channel: string; status?: string };
    }) =>
      this.logs.find(
        (log) =>
          log.eventId === args.where.eventId &&
          log.channel === args.where.channel &&
          (args.where.status === undefined || log.status === args.where.status),
      ) ?? null,
    create: async (args: { data: Record<string, unknown> }) => {
      const data = { id: `log-${this.logs.length + 1}`, ...args.data };
      this.logs.push(data);
      return data;
    },
    update: async (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const existing = this.logs.find((log) => log.id === args.where.id);
      if (!existing) throw new Error("Missing notification log.");
      Object.assign(existing, args.data);
      return existing;
    },
  };

  readonly $queryRaw = async (query: SqlQuery) => {
    const sql = query.strings.join("?");
    if (sql.includes("INSERT INTO processed_events")) {
      const [consumer, eventId, leaseExpiresAt, now] = query.values as [
        string,
        string,
        Date,
        Date,
      ];
      const key = this.key(consumer, eventId);
      const current = this.progress.get(key);
      if (!current) {
        this.progress.set(key, {
          status: "PROCESSING",
          leaseExpiresAt,
          completedAt: null,
          attempts: 0,
        });
        return [{ lease_expires_at: leaseExpiresAt }];
      }
      if (
        current.status !== "DONE" &&
        (current.leaseExpiresAt === null || current.leaseExpiresAt <= now)
      ) {
        Object.assign(current, {
          status: "PROCESSING",
          leaseExpiresAt,
          completedAt: null,
        });
        return [{ lease_expires_at: leaseExpiresAt }];
      }
      return [];
    }

    if (sql.includes("UPDATE processed_events")) {
      const [consumer, eventId, leaseExpiresAt] = query.values as [
        string,
        string,
        Date,
      ];
      const current = this.progress.get(this.key(consumer, eventId));
      if (
        !current ||
        current.status !== "PROCESSING" ||
        current.leaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
      )
        return [];
      current.status = "FAILED";
      current.leaseExpiresAt = null;
      current.attempts += 1;
      return [{ attempts: current.attempts }];
    }

    throw new Error(`Unexpected SQL in persistence test: ${sql}`);
  };

  private readonly updateMany = async (args: {
    where: {
      consumer: string;
      eventId: string;
      status: string;
      leaseExpiresAt: Date;
    };
    data: {
      status: "DONE";
      completedAt: Date;
      leaseExpiresAt: null;
    };
  }) => {
    const current = this.progress.get(
      this.key(args.where.consumer, args.where.eventId),
    );
    if (
      !current ||
      current.status !== args.where.status ||
      current.leaseExpiresAt?.getTime() !== args.where.leaseExpiresAt.getTime()
    )
      return { count: 0 };
    Object.assign(current, args.data);
    return { count: 1 };
  };

  asDatabase() {
    return {
      $queryRaw: this.$queryRaw,
      processedEvent: {
        findUnique: this.processedEvent.findUnique,
        updateMany: this.updateMany,
      },
      notificationLog: this.notificationLog,
    } as unknown as Database;
  }

  private key(consumer: string, eventId: string) {
    return `${consumer}:${eventId}`;
  }
}

const consumer = "notification-svc";
const eventId = "11111111-1111-4111-8111-111111111111";

describe("PrismaProcessedEventStore", () => {
  it("atomically gives only one concurrent claimant the active lease", async () => {
    const database = new PersistenceDatabaseHarness();
    const now = new Date("2026-11-13T10:00:00.000Z");
    const store = new PrismaProcessedEventStore(
      database.asDatabase(),
      () => now,
    );

    const claims = await Promise.all([
      store.claim({ consumer, eventId, leaseMs: 60_000 }),
      store.claim({ consumer, eventId, leaseMs: 60_000 }),
    ]);

    expect(claims.map((claim) => claim.outcome).sort()).toEqual([
      "acquired",
      "busy",
    ]);
    expect(database.progress.get(`${consumer}:${eventId}`)).toMatchObject({
      status: "PROCESSING",
      leaseExpiresAt: new Date("2026-11-13T10:01:00.000Z"),
    });
  });

  it("reclaims an expired lease and fences the expired claimant", async () => {
    const database = new PersistenceDatabaseHarness();
    let now = new Date("2026-11-13T10:00:00.000Z");
    const store = new PrismaProcessedEventStore(
      database.asDatabase(),
      () => now,
    );
    const first = await store.claim({ consumer, eventId, leaseMs: 60_000 });
    expect(first.outcome).toBe("acquired");
    if (first.outcome !== "acquired") throw new Error("Expected first claim.");

    now = new Date("2026-11-13T10:00:30.000Z");
    await expect(
      store.claim({ consumer, eventId, leaseMs: 60_000 }),
    ).resolves.toMatchObject({ outcome: "busy" });

    now = new Date("2026-11-13T10:01:01.000Z");
    const reclaimed = await store.claim({
      consumer,
      eventId,
      leaseMs: 60_000,
    });
    expect(reclaimed.outcome).toBe("acquired");
    if (reclaimed.outcome !== "acquired")
      throw new Error("Expected reclaimed lease.");

    await expect(
      store.markDone({
        consumer,
        eventId,
        leaseExpiresAt: first.leaseExpiresAt,
      }),
    ).resolves.toBe(false);
    await expect(
      store.markDone({
        consumer,
        eventId,
        leaseExpiresAt: reclaimed.leaseExpiresAt,
      }),
    ).resolves.toBe(true);
    expect(database.progress.get(`${consumer}:${eventId}`)).toMatchObject({
      status: "DONE",
      completedAt: now,
      leaseExpiresAt: null,
    });
    await expect(
      store.claim({ consumer, eventId, leaseMs: 60_000 }),
    ).resolves.toEqual({ outcome: "done" });
  });

  it("records FAILED without a lease and allows an immediate retry", async () => {
    const database = new PersistenceDatabaseHarness();
    const now = new Date("2026-11-13T10:00:00.000Z");
    const store = new PrismaProcessedEventStore(
      database.asDatabase(),
      () => now,
    );
    const first = await store.claim({ consumer, eventId, leaseMs: 60_000 });
    if (first.outcome !== "acquired") throw new Error("Expected first claim.");

    await expect(
      store.markFailed({
        consumer,
        eventId,
        leaseExpiresAt: first.leaseExpiresAt,
      }),
    ).resolves.toEqual({ updated: true, attempts: 1 });
    expect(database.progress.get(`${consumer}:${eventId}`)).toMatchObject({
      status: "FAILED",
      attempts: 1,
      leaseExpiresAt: null,
    });
    await expect(
      store.claim({ consumer, eventId, leaseMs: 60_000 }),
    ).resolves.toMatchObject({ outcome: "acquired" });
  });
});

describe("PrismaNotificationLogStore", () => {
  it("rejects raw recipients and persists masked values only", async () => {
    const database = new PersistenceDatabaseHarness();
    const store = new PrismaNotificationLogStore(database.asDatabase());
    const base = {
      eventId,
      channel: "EMAIL" as const,
      templateId: "booking_confirmation",
      status: "SENT" as const,
    };

    await expect(
      store.append({ ...base, recipientMasked: "customer@example.test" }),
    ).rejects.toThrow("masked recipient");
    await store.append({ ...base, recipientMasked: "c***@example.test" });

    expect(database.logs).toHaveLength(1);
    expect(database.logs[0]).toMatchObject({
      recipientMasked: "c***@example.test",
    });
    expect(JSON.stringify(database.logs)).not.toContain(
      "customer@example.test",
    );
  });

  it("keeps one durable log per event channel across retry outcomes", async () => {
    const database = new PersistenceDatabaseHarness();
    const store = new PrismaNotificationLogStore(database.asDatabase());
    const base = {
      eventId,
      channel: "EMAIL" as const,
      templateId: "booking_confirmation",
      recipientMasked: "c***@example.test",
    };

    await store.append({
      ...base,
      status: "FAILED",
      errorMessage: "DELIVERY_FAILED",
    });
    await store.append({
      ...base,
      status: "SENT",
      providerMessageId: "smtp-1",
    });

    expect(database.logs).toHaveLength(1);
    expect(database.logs[0]).toMatchObject({
      status: "SENT",
      providerMsgId: "smtp-1",
      errorMsg: null,
      recipientMasked: "c***@example.test",
    });
  });

  it("replaces unsafe provider error text with a stable code", async () => {
    const database = new PersistenceDatabaseHarness();
    const store = new PrismaNotificationLogStore(database.asDatabase());

    await store.append({
      eventId,
      channel: "SMS",
      templateId: "status_update",
      recipientMasked: "***4567",
      status: "FAILED",
      errorMessage: "provider exposed private@example.test",
    });

    expect(database.logs[0]).toMatchObject({
      errorMsg: "NOTIFICATION_FAILED",
    });
    expect(JSON.stringify(database.logs)).not.toContain("private@example.test");
  });
});
