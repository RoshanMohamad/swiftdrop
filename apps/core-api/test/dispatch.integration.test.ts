import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@swiftdrop/db";
import { DispatchService } from "../src/modules/dispatch/index.js";
import { LifecycleService } from "../src/modules/lifecycle/index.js";
import { CourierService } from "../src/modules/courier/service.js";
import type { ProofStorage } from "../src/modules/courier/storage.js";
import { HttpError } from "../src/shared/problem.js";

/**
 * M06/M07 behaviour against a real PostgreSQL: capacity locks, reassignment atomicity, capacity
 * release on terminal states and exactly-once courier operations (NFR-7). Set
 * DISPATCH_TEST_DATABASE_URL to reuse a migrated disposable database instead of a container.
 */
const root = resolve(import.meta.dirname, "../../..");
let container: StartedTestContainer | undefined;
let db: Database;
let dispatch: DispatchService;
let lifecycle: LifecycleService;
let courier: CourierService;
const stored = new Set<string>();
const storage: ProofStorage = {
  put: async (key) => void stored.add(key),
  exists: async (key) => stored.has(key),
};

function migrate(url: string) {
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

beforeAll(async () => {
  let url = process.env.DISPATCH_TEST_DATABASE_URL;
  if (!url) {
    container = await new GenericContainer("postgres:17-alpine")
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "dispatch_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections", 2),
      )
      .start();
    url = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/dispatch_test`;
    migrate(url);
  }
  db = createDatabase(url);
  for (const role of [
    "CUSTOMER",
    "MERCHANT",
    "COURIER",
    "DISPATCHER",
    "ADMIN",
  ] as const)
    await db.role.upsert({
      where: { id: role },
      update: {},
      create: { id: role },
    });
  dispatch = new DispatchService(db);
  lifecycle = new LifecycleService(db);
  courier = new CourierService(db, lifecycle, storage);
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  await container?.stop();
}, 60_000);

let counter = 0;
let customerId: number;
let dispatcherId: number;
let originId: number;
let destinationId: number;
let priceVersionId: number;

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "courier_operations","parcel_assignments","courier_profiles","outbox_events","parcel_history","parcels","quotes","price_versions","zones","users" RESTART IDENTITY CASCADE',
  );
  const customer = await newUser("CUSTOMER");
  customerId = customer.id;
  dispatcherId = (await newUser("DISPATCHER")).id;
  const origin = await db.zone.create({
    data: { district: "Colombo", town: "Colombo" },
  });
  const destination = await db.zone.create({
    data: { district: "Kandy", town: "Kandy" },
  });
  originId = origin.id;
  destinationId = destination.id;
  priceVersionId = (
    await db.priceVersion.create({
      data: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        baseCents: 45000,
        perExtraKgCents: 12000,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      },
    })
  ).id;
  stored.clear();
});

async function newUser(role: "CUSTOMER" | "COURIER" | "DISPATCHER") {
  counter += 1;
  return db.user.create({
    data: {
      email: `${role.toLowerCase()}${counter}@example.test`,
      fullName: `Test ${role} ${counter}`,
      phone: "+94771234567",
      roleId: role,
    },
  });
}

async function newCourier(
  options: { capacity?: number; onDuty?: boolean } = {},
) {
  const user = await newUser("COURIER");
  await dispatch.updateProfile(user.id, {
    capacity: options.capacity ?? 5,
    onDuty: options.onDuty ?? true,
  });
  return user.id;
}

async function newParcel(createdAt?: Date) {
  const serial = ++counter;
  const quote = await db.quote.create({
    data: {
      userId: customerId,
      originZoneId: originId,
      destinationZoneId: destinationId,
      priceVersionId,
      weightGrams: 1000,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
      feeCents: 45000,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  return db.parcel.create({
    data: {
      trackingNumber: `SD-T${String(serial).padStart(7, "0")}-X`,
      userId: customerId,
      quoteId: quote.id,
      originZoneId: originId,
      destinationZoneId: destinationId,
      feeCents: 45000,
      recipientName: "Recipient Person",
      recipientPhone: "+94771234567",
      recipientAddress: "1 Test Road",
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

const workload = async (id: number) =>
  (await db.courierProfile.findUniqueOrThrow({ where: { userId: id } }))
    .workload;
const version = async (id: string) =>
  (await db.parcel.findUniqueOrThrow({ where: { id } })).version;

async function problem(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("expected the call to be rejected");
}

describe("dispatch queue (FR-D1)", () => {
  it("lists unassigned CREATED parcels oldest first and filters by pickup zone", async () => {
    const older = await newParcel(new Date("2026-01-01T00:00:00Z"));
    const newer = await newParcel(new Date("2026-01-02T00:00:00Z"));
    const other = await db.zone.create({
      data: { district: "Galle", town: "Galle" },
    });
    const elsewhere = await newParcel();
    await db.parcel.update({
      where: { id: elsewhere.id },
      data: { originZoneId: other.id },
    });
    const c = await newCourier();
    await dispatch.assign(dispatcherId, newer.id, c, 1);

    const queue = await dispatch.listParcels({ state: "unassigned" });
    expect(queue.items.map((item) => item.id)).toEqual([
      older.id,
      elsewhere.id,
    ]);
    const filtered = await dispatch.listParcels({
      state: "unassigned",
      zoneId: originId,
    });
    expect(filtered.items.map((item) => item.id)).toEqual([older.id]);
    const assigned = await dispatch.listParcels({ state: "assigned" });
    expect(assigned.items.map((item) => [item.id, item.courierId])).toEqual([
      [newer.id, c],
    ]);
    const paged = await dispatch.listParcels({ state: "unassigned", limit: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).not.toBeNull();
    const next = await dispatch.listParcels({
      state: "unassigned",
      limit: 1,
      cursor: paged.nextCursor!,
    });
    expect(next.items[0]?.id).toBe(elsewhere.id);
  });
});

describe("assignment protocol (FR-D2)", () => {
  it("assigns, bumps the version, counts workload and writes one outbox event", async () => {
    const parcel = await newParcel();
    const c = await newCourier();
    const result = await dispatch.assign(dispatcherId, parcel.id, c, 1);
    expect(result).toMatchObject({ courierId: c, version: 2, changed: true });
    expect(await workload(c)).toBe(1);
    const events = await db.outboxEvent.findMany({
      where: { aggregateId: parcel.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("parcel.assignment.changed");
    expect(events[0]?.payload).toMatchObject({
      sequence: 2,
      data: { newCourierId: String(c) },
    });
  });

  it("is a no-op for the current courier and 409s on a stale version", async () => {
    const parcel = await newParcel();
    const c = await newCourier();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    const repeat = await dispatch.assign(dispatcherId, parcel.id, c, 1);
    expect(repeat).toMatchObject({ changed: false, version: 2 });
    expect(await workload(c)).toBe(1);
    const other = await newCourier();
    const stale = await problem(
      dispatch.assign(dispatcherId, parcel.id, other, 1),
    );
    expect(stale.code).toBe("VERSION_CONFLICT");
    expect(await workload(other)).toBe(0);
  });

  it("rejects off-duty couriers, full couriers and unknown couriers", async () => {
    const parcel = await newParcel();
    const off = await newCourier({ onDuty: false });
    expect(
      (await problem(dispatch.assign(dispatcherId, parcel.id, off, 1))).code,
    ).toBe("COURIER_OFF_DUTY");
    const full = await newCourier({ capacity: 1 });
    await dispatch.assign(dispatcherId, parcel.id, full, 1);
    const second = await newParcel();
    expect(
      (await problem(dispatch.assign(dispatcherId, second.id, full, 1))).code,
    ).toBe("COURIER_AT_CAPACITY");
    expect(
      (await problem(dispatch.assign(dispatcherId, second.id, 99999, 1)))
        .status,
    ).toBe(404);
  });

  it("lets only one of two concurrent assignments take the last free slot", async () => {
    const c = await newCourier({ capacity: 1 });
    const parcels = await Promise.all([newParcel(), newParcel(), newParcel()]);
    const outcomes = await Promise.allSettled(
      parcels.map((parcel) => dispatch.assign(dispatcherId, parcel.id, c, 1)),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await workload(c)).toBe(1);
    expect(
      await db.parcelAssignment.count({
        where: { courierId: c, releasedAt: null },
      }),
    ).toBe(1);
  });

  it("serialises two dispatchers assigning the same parcel", async () => {
    const parcel = await newParcel();
    const a = await newCourier();
    const b = await newCourier();
    const outcomes = await Promise.allSettled([
      dispatch.assign(dispatcherId, parcel.id, a, 1),
      dispatch.assign(dispatcherId, parcel.id, b, 1),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect((await workload(a)) + (await workload(b))).toBe(1);
    expect(await version(parcel.id)).toBe(2);
  });

  it("moves workload atomically on reassignment and survives opposite concurrent swaps", async () => {
    const a = await newCourier();
    const b = await newCourier();
    const p1 = await newParcel();
    const p2 = await newParcel();
    await dispatch.assign(dispatcherId, p1.id, a, 1);
    await dispatch.assign(dispatcherId, p2.id, b, 1);
    // Opposite directions touch the same two courier rows; sorted locking prevents deadlock.
    const outcomes = await Promise.allSettled([
      dispatch.assign(dispatcherId, p1.id, b, 2),
      dispatch.assign(dispatcherId, p2.id, a, 2),
    ]);
    expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
    expect(await workload(a)).toBe(1);
    expect(await workload(b)).toBe(1);
    const events = await db.outboxEvent.findMany({
      where: { aggregateId: p1.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events[1]?.payload).toMatchObject({
      data: { oldCourierId: String(a), newCourierId: String(b) },
    });
  });

  it("refuses finished parcels", async () => {
    const parcel = await newParcel();
    await lifecycle.cancel(parcel.id, customerId, "CUSTOMER", 1);
    const c = await newCourier();
    expect(
      (await problem(dispatch.assign(dispatcherId, parcel.id, c, 2))).code,
    ).toBe("PARCEL_NOT_ASSIGNABLE");
  });

  it("will not lower capacity below the current workload", async () => {
    const c = await newCourier({ capacity: 3 });
    await dispatch.assign(dispatcherId, (await newParcel()).id, c, 1);
    await dispatch.assign(dispatcherId, (await newParcel()).id, c, 1);
    expect(
      (await problem(dispatch.updateProfile(c, { capacity: 1 }))).code,
    ).toBe("CAPACITY_BELOW_WORKLOAD");
    expect(await dispatch.updateProfile(c, { capacity: 2 })).toMatchObject({
      capacity: 2,
      workload: 2,
    });
  });
});

describe("capacity release through LifecycleService", () => {
  async function drive(parcelId: string, steps: Array<[string, number]>) {
    for (const [to, expected] of steps)
      await lifecycle.transition(parcelId, to as never, "Colombo", expected);
  }

  it("returns capacity when a delivery completes", async () => {
    const parcel = await newParcel();
    const c = await newCourier();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    await drive(parcel.id, [
      ["PICKED_UP", 2],
      ["IN_TRANSIT", 3],
      ["OUT_FOR_DELIVERY", 4],
    ]);
    expect(await workload(c)).toBe(1);
    await lifecycle.transition(parcel.id, "DELIVERED", "Kandy", 5);
    expect(await workload(c)).toBe(0);
    const row = await db.parcelAssignment.findUniqueOrThrow({
      where: { parcelId: parcel.id },
    });
    expect(row.releaseReason).toBe("DELIVERED");
  });

  it("returns capacity on cancellation and keeps it while re-attempts remain", async () => {
    const cancelled = await newParcel();
    const c = await newCourier();
    await dispatch.assign(dispatcherId, cancelled.id, c, 1);
    await lifecycle.cancel(cancelled.id, dispatcherId, "DISPATCHER", 2);
    expect(await workload(c)).toBe(0);

    const retried = await newParcel();
    await dispatch.assign(dispatcherId, retried.id, c, 1);
    await drive(retried.id, [
      ["PICKED_UP", 2],
      ["IN_TRANSIT", 3],
      ["OUT_FOR_DELIVERY", 4], // attempt 1
      ["FAILED", 5],
    ]);
    expect(await workload(c)).toBe(1);
    await drive(retried.id, [
      ["OUT_FOR_DELIVERY", 6], // attempt 2
      ["FAILED", 7],
      ["OUT_FOR_DELIVERY", 8], // attempt 3
    ]);
    expect(await workload(c)).toBe(1);
    await lifecycle.transition(retried.id, "FAILED", "Kandy", 9);
    expect(await workload(c)).toBe(0);
    const row = await db.parcelAssignment.findUniqueOrThrow({
      where: { parcelId: retried.id },
    });
    expect(row.releaseReason).toBe("FAILED");
  });

  it("includes the courier id in the status event", async () => {
    const parcel = await newParcel();
    const c = await newCourier();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    await lifecycle.transition(parcel.id, "PICKED_UP", "Colombo", 2);
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { aggregateId: parcel.id, eventType: "parcel.status.changed" },
    });
    expect(event.payload).toMatchObject({ data: { courierId: String(c) } });
  });
});

describe("courier delivery (FR-K1, FR-K2, FR-K3)", () => {
  it("lists only the courier's own active jobs", async () => {
    const mine = await newCourier();
    const theirs = await newCourier();
    const a = await newParcel();
    const b = await newParcel();
    await dispatch.assign(dispatcherId, a.id, mine, 1);
    await dispatch.assign(dispatcherId, b.id, theirs, 1);
    const jobs = await courier.jobs(mine);
    expect(jobs.items.map((job) => job.id)).toEqual([a.id]);
    expect(jobs.profile).toMatchObject({ workload: 1, onDuty: true });
  });

  it("hides another courier's parcel behind 404", async () => {
    const mine = await newCourier();
    const theirs = await newCourier();
    const parcel = await newParcel();
    await dispatch.assign(dispatcherId, parcel.id, theirs, 1);
    const denied = await problem(
      courier.updateStatus(mine, parcel.id, "key-12345678", {
        to: "PICKED_UP",
        town: "Colombo",
        version: 2,
      }),
    );
    expect(denied.status).toBe(404);
    expect(
      (
        await problem(
          courier.uploadProof(
            mine,
            parcel.id,
            Buffer.from([0xff, 0xd8, 0xff, 0]),
            "image/jpeg",
          ),
        )
      ).status,
    ).toBe(404);
  });

  it("applies an update once and returns the original result on replay", async () => {
    const c = await newCourier();
    const parcel = await newParcel();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    const body = { to: "PICKED_UP" as const, town: "Colombo", version: 2 };
    const first = await courier.updateStatus(c, parcel.id, "op-key-0001", body);
    expect(first).toMatchObject({
      status: "PICKED_UP",
      version: 3,
      replayed: false,
    });
    const replay = await courier.updateStatus(
      c,
      parcel.id,
      "op-key-0001",
      body,
    );
    expect(replay).toMatchObject({
      status: "PICKED_UP",
      version: 3,
      replayed: true,
    });
    expect(await version(parcel.id)).toBe(3);
    expect(
      await db.parcelHistory.count({
        where: { parcelId: parcel.id, status: "PICKED_UP" },
      }),
    ).toBe(1);
    const reused = await problem(
      courier.updateStatus(c, parcel.id, "op-key-0001", {
        ...body,
        town: "Elsewhere",
      }),
    );
    expect(reused.code).toBe("OPERATION_KEY_REUSED");
  });

  it("applies concurrent duplicates of the same operation exactly once", async () => {
    const c = await newCourier();
    const parcel = await newParcel();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    const body = { to: "PICKED_UP" as const, town: "Colombo", version: 2 };
    const results = await Promise.allSettled([
      courier.updateStatus(c, parcel.id, "op-key-race1", body),
      courier.updateStatus(c, parcel.id, "op-key-race1", body),
      courier.updateStatus(c, parcel.id, "op-key-race1", body),
    ]);
    const ok = results.filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<typeof courier.updateStatus>>
      > => r.status === "fulfilled",
    );
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.value.version))).toEqual(new Set([3]));
    expect(await version(parcel.id)).toBe(3);
  });

  it("pauses on a stale version instead of overwriting newer server state", async () => {
    const c = await newCourier();
    const parcel = await newParcel();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    await lifecycle.transition(parcel.id, "PICKED_UP", "Colombo", 2);
    const stale = await problem(
      courier.updateStatus(c, parcel.id, "op-key-stale", {
        to: "PICKED_UP",
        town: "Colombo",
        version: 2,
      }),
    );
    expect(stale.status).toBe(409);
  });

  it("records proof for DELIVERED, releases capacity and checks the photo exists", async () => {
    const c = await newCourier();
    const parcel = await newParcel();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    let v = 2;
    for (const to of ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] as const) {
      await courier.updateStatus(c, parcel.id, `step-${to}-0001`, {
        to,
        town: "Colombo",
        version: v,
      });
      v += 1;
    }
    const missing = await problem(
      courier.updateStatus(c, parcel.id, "deliver-0001", {
        to: "DELIVERED",
        town: "Kandy",
        version: v,
        receivedBy: "Nimal Perera",
        proofObjectKey: `proofs/${parcel.id}/${randomUUID()}.jpg`,
      }),
    );
    expect(missing.code).toBe("PROOF_NOT_FOUND");
    const upload = await courier.uploadProof(
      c,
      parcel.id,
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      "image/jpeg",
    );
    expect(upload.proofObjectKey).toMatch(/^proofs\/.+\.jpg$/);
    const done = await courier.updateStatus(c, parcel.id, "deliver-0002", {
      to: "DELIVERED",
      town: "Kandy",
      version: v,
      receivedBy: "Nimal Perera",
      proofObjectKey: upload.proofObjectKey,
    });
    expect(done.status).toBe("DELIVERED");
    expect(await workload(c)).toBe(0);
    const ledger = await db.courierOperation.findFirstOrThrow({
      where: { operationKey: "deliver-0002" },
    });
    expect(ledger).toMatchObject({
      receivedBy: "Nimal Perera",
      proofObjectKey: upload.proofObjectKey,
    });
    expect((await courier.jobs(c)).items).toHaveLength(0);
  });

  it("rejects non-image uploads and stops couriers re-attempting a failed delivery", async () => {
    const c = await newCourier();
    const parcel = await newParcel();
    await dispatch.assign(dispatcherId, parcel.id, c, 1);
    const bad = await problem(
      courier.uploadProof(
        c,
        parcel.id,
        Buffer.from("not an image"),
        "image/jpeg",
      ),
    );
    expect(bad.status).toBe(415);
    let v = 2;
    for (const to of ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] as const) {
      await courier.updateStatus(c, parcel.id, `fail-${to}-0001`, {
        to,
        town: "Colombo",
        version: v++,
      });
    }
    await courier.updateStatus(c, parcel.id, "fail-failed-001", {
      to: "FAILED",
      town: "Kandy",
      version: v++,
      failureReason: "RECIPIENT_ABSENT",
    });
    const blocked = await problem(
      courier.updateStatus(c, parcel.id, "fail-retry-0001", {
        to: "OUT_FOR_DELIVERY",
        town: "Kandy",
        version: v,
      }),
    );
    expect(blocked.code).toBe("REATTEMPT_REQUIRES_DISPATCH");
    // Dispatcher schedules the re-attempt through the lifecycle service.
    await lifecycle.transition(parcel.id, "OUT_FOR_DELIVERY", "Kandy", v);
    expect((await courier.jobs(c)).items[0]).toMatchObject({ attemptCount: 2 });
  });

  it("changes duty only once a dispatcher created the profile", async () => {
    const user = await newUser("COURIER");
    expect((await problem(courier.setDuty(user.id, true))).code).toBe(
      "PROFILE_PENDING",
    );
    await dispatch.updateProfile(user.id, { capacity: 4 });
    expect(await courier.setDuty(user.id, true)).toMatchObject({
      onDuty: true,
      capacity: 4,
    });
  });
});
