import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createDatabase, type Database } from "@swiftdrop/db";
import { PrismaProgressStore } from "../src/store.js";
import type { Message } from "../src/templates.js";

/**
 * Durable progress against a real PostgreSQL (FR-I3). Set NOTIFICATION_TEST_DATABASE_URL to reuse
 * a migrated disposable database instead of starting a container.
 */
const root = resolve(import.meta.dirname, "../../..");
let container: StartedTestContainer | undefined;
let db: Database;
let store: PrismaProgressStore;
const EVENT = "22222222-2222-4222-8222-222222222222";
const email: Message = {
  channel: "EMAIL",
  templateId: "booking-confirmation",
  to: "customer@example.test",
  text: "hello",
};

beforeAll(async () => {
  let url = process.env.NOTIFICATION_TEST_DATABASE_URL;
  if (!url) {
    container = await new GenericContainer("postgres:17-alpine")
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "notification_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections", 2),
      )
      .start();
    url = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/notification_test`;
    execFileSync(
      process.execPath,
      [
        resolve(root, "packages/db/node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: resolve(root, "packages/db"),
        env: { ...process.env, DATABASE_URL: url },
        stdio: "pipe",
      },
    );
  }
  db = createDatabase(url);
  store = new PrismaProgressStore(db);
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  await container?.stop();
}, 60_000);

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "processed_events","notification_logs"',
  );
});

describe("PrismaProgressStore (FR-I3)", () => {
  it("lets exactly one of two concurrent workers claim an event", async () => {
    const claims = await Promise.all([
      store.claim(EVENT, 60_000),
      store.claim(EVENT, 60_000),
    ]);
    expect([...claims].sort()).toEqual(["busy", "claimed"]);
  });

  it("reports a completed event as done so a redelivery is suppressed", async () => {
    expect(await store.claim(EVENT, 60_000)).toBe("claimed");
    await store.complete(EVENT);
    expect(await store.claim(EVENT, 60_000)).toBe("done");
  });

  it("allows a retry after a released (failed) attempt", async () => {
    await store.claim(EVENT, 60_000);
    await store.release(EVENT);
    expect(await store.claim(EVENT, 60_000)).toBe("claimed");
  });

  it("takes over an expired lease but not a live one", async () => {
    await store.claim(EVENT, 60_000);
    expect(await store.claim(EVENT, 60_000)).toBe("busy");
    await db.processedEvent.updateMany({
      where: { eventId: EVENT },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await store.claim(EVENT, 60_000)).toBe("claimed");
  });

  it("records one masked row per (event, channel, template) and remembers SENT", async () => {
    expect(await store.alreadySent(EVENT, email)).toBe(false);
    await store.record(EVENT, email, { status: "FAILED", error: "Error" });
    expect(await store.alreadySent(EVENT, email)).toBe(false);
    await store.record(EVENT, email, {
      status: "SENT",
      providerMessageId: "msg-1",
    });
    expect(await store.alreadySent(EVENT, email)).toBe(true);
    const rows = await db.notificationLog.findMany({ where: { eventId: EVENT } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "SENT",
      recipientMasked: "c***@example.test",
    });
    expect(JSON.stringify(rows)).not.toContain("customer@example.test");
  });
});
