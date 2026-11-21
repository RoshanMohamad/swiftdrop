import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createDatabase, type Database } from "@swiftdrop/db";
import { trackingNumberSchema } from "@swiftdrop/contracts";
import { ParcelService } from "../src/modules/parcels/service.js";
import { PricingService } from "../src/modules/pricing/service.js";
import { HttpError } from "../src/shared/problem.js";

/**
 * M03/M04 against a real PostgreSQL: quotes and price versions (FR-P1/P2), booking from a quote
 * with idempotency (FR-P3), the customer's own list/detail (FR-P6), public tracking (FR-P7) and
 * merchant orders. The rules under test: money is integer cents and locked to the quote, a quote
 * is used once, a repeated key returns the original parcel, and foreign records are invisible.
 */
const root = resolve(import.meta.dirname, "../../..");
jest.setTimeout(60_000);
const KEY = "booking-key-0000001";

let container: StartedTestContainer;
let db: Database;
let pricing: PricingService;
let parcels: ParcelService;
let counter = 0;
let customerId: number;
let otherId: number;
let colombo: { id: number };
let kandy: { id: number };

const migrate = (url: string) =>
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

beforeAll(async () => {
  container = await new GenericContainer("postgres:17-alpine")
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "booking_test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  const url = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/booking_test`;
  migrate(url);
  db = createDatabase(url);
  for (const role of ["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"] as const)
    await db.role.upsert({ where: { id: role }, update: {}, create: { id: role } });
  pricing = new PricingService(db);
  parcels = new ParcelService(db, pricing);
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  await container?.stop();
}, 60_000);

const newUser = (roleId: "CUSTOMER" | "MERCHANT", status: "ACTIVE" | "SUSPENDED" = "ACTIVE") => {
  const n = ++counter;
  return db.user.create({
    data: {
      email: `user${n}@example.test`,
      fullName: `User ${n}`,
      phone: "+94771234567",
      roleId,
      status,
    },
  });
};

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "idempotency_records","parcel_receipts","outbox_events","parcel_history","parcels","quotes","price_versions","zones","merchants","users" RESTART IDENTITY CASCADE',
  );
  customerId = (await newUser("CUSTOMER")).id;
  otherId = (await newUser("CUSTOMER")).id;
  colombo = await db.zone.create({ data: { district: "Colombo", town: "Colombo" } });
  kandy = await db.zone.create({ data: { district: "Kandy", town: "Kandy" } });
  // The design report's worked example: base LKR 450.00, LKR 120.00 per extra kg.
  await db.priceVersion.create({
    data: {
      originZoneId: colombo.id,
      destinationZoneId: kandy.id,
      baseCents: 45000,
      perExtraKgCents: 12000,
      effectiveFrom: new Date("2020-01-01T00:00:00Z"),
    },
  });
});

const route = {
  originDistrict: "Colombo",
  destinationDistrict: "Kandy",
  weightGrams: 2000,
  lengthMm: 200,
  widthMm: 150,
  heightMm: 100,
};
const recipient = {
  recipientName: "Kamal Perera",
  recipientPhone: "+94771234567", // the route normalizes 07x to +94 before the service
  recipientAddress: "12 Temple Road, Kandy",
};
const book = async (userId = customerId, key = KEY, body: Record<string, unknown> = {}) => {
  const quote = await pricing.createQuote(userId, route);
  return { quote, parcel: await parcels.book(userId, key, { quoteId: quote.id, ...recipient, ...body } as never) };
};

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
  throw new Error("expected the call to be rejected");
}

describe("quotes and price versions (FR-P1, FR-P2)", () => {
  it("prices the worked example, Colombo to Kandy 2 kg, at LKR 570.00 in integer cents", async () => {
    const quote = await pricing.createQuote(customerId, route);
    expect(quote).toMatchObject({
      feeCents: 57000,
      currency: "LKR",
      originTown: "Colombo",
      destinationTown: "Kandy",
    });
    expect(Number.isInteger(quote.feeCents)).toBe(true);
    const minutes = (Date.parse(quote.expiresAt) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14.5);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it("matches districts case-insensitively and an estimate stores nothing", async () => {
    const estimate = await pricing.estimate({
      ...route,
      originDistrict: "  colombo ".trim().toUpperCase(),
    });
    expect(estimate.feeCents).toBe(57000);
    expect(await db.quote.count()).toBe(0);
  });

  it("refuses unserved, identical and unpriced routes with 422", async () => {
    await db.zone.update({ where: { id: kandy.id }, data: { active: false } });
    expect((await rejection(pricing.createQuote(customerId, route))).code).toBe(
      "UNSERVED_AREA",
    );
    expect(
      (await rejection(pricing.createQuote(customerId, { ...route, originDistrict: "Nowhere" })))
        .code,
    ).toBe("UNSERVED_AREA");
    await db.zone.update({ where: { id: kandy.id }, data: { active: true } });
    expect(
      (
        await rejection(
          pricing.createQuote(customerId, { ...route, destinationDistrict: "Colombo" }),
        )
      ).code,
    ).toBe("INVALID_ROUTE");
    await db.zone.create({ data: { district: "Galle", town: "Galle" } });
    const unpriced = await rejection(
      pricing.createQuote(customerId, { ...route, destinationDistrict: "Galle" }),
    );
    expect([unpriced.status, unpriced.code]).toEqual([422, "PRICE_UNAVAILABLE"]);
  });

  it("uses the newest effective price while old quotes keep the price they were given", async () => {
    const before = await pricing.createQuote(customerId, route);
    await db.priceVersion.create({
      data: {
        originZoneId: colombo.id,
        destinationZoneId: kandy.id,
        baseCents: 50000,
        perExtraKgCents: 15000,
        effectiveFrom: new Date("2021-01-01T00:00:00Z"),
      },
    });
    const after = await pricing.createQuote(customerId, route);
    expect(before.feeCents).toBe(57000);
    expect(after.feeCents).toBe(65000);
    const stored = await db.quote.findUniqueOrThrow({ where: { id: before.id } });
    expect(stored.feeCents).toBe(57000);
    expect(
      (await db.quote.findUniqueOrThrow({ where: { id: after.id } })).priceVersionId,
    ).not.toBe(stored.priceVersionId);
  });

  it("validates a quote for booking: owner, unused and unexpired", async () => {
    const quote = await pricing.createQuote(customerId, route);
    expect((await pricing.getQuote(quote.id)).feeCents).toBe(57000);
    expect((await rejection(pricing.getQuote("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    expect((await pricing.validateQuoteForBooking(quote.id, customerId)).id).toBe(quote.id);
    expect((await rejection(pricing.validateQuoteForBooking(quote.id, otherId))).status).toBe(404);
    await db.quote.update({ where: { id: quote.id }, data: { consumedAt: new Date() } });
    expect((await rejection(pricing.validateQuoteForBooking(quote.id, customerId))).status).toBe(409);
    await db.quote.update({
      where: { id: quote.id },
      data: { consumedAt: null, expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await rejection(pricing.validateQuoteForBooking(quote.id, customerId))).status).toBe(410);
  });
});

describe("zone and price administration (FR-P1)", () => {
  it("creates zones once, toggles them, and keeps names fixed after creation", async () => {
    const galle = await pricing.createZone({ district: "Galle", town: "Galle", active: true });
    expect(galle).toMatchObject({ district: "Galle", active: true });
    expect((await rejection(pricing.createZone({ district: "GALLE", town: "Galle", active: true }))).code).toBe(
      "DISTRICT_EXISTS",
    );
    expect(
      (await pricing.updateZone(galle.id, { district: "Galle", town: "Galle", active: false })).active,
    ).toBe(false);
    expect(
      (await rejection(pricing.updateZone(galle.id, { district: "Matara", town: "Galle", active: true })))
        .code,
    ).toBe("ZONE_REFERENCED");
    expect((await rejection(pricing.updateZone(99999, { district: "X1", town: "X1", active: true }))).status).toBe(404);
    expect((await pricing.listZones()).map((z) => z.district)).toEqual(
      ["Colombo", "Galle", "Kandy"],
    );
  });

  it("deletes only unreferenced zones", async () => {
    const galle = await pricing.createZone({ district: "Galle", town: "Galle", active: true });
    await pricing.deleteZone(galle.id);
    expect((await rejection(pricing.deleteZone(galle.id))).status).toBe(404);
    expect((await rejection(pricing.deleteZone(colombo.id))).code).toBe("ZONE_IN_USE");
  });

  it("accepts only future prices between two active, different districts", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const base = {
      originZoneId: colombo.id,
      destinationZoneId: kandy.id,
      baseCents: 60000,
      perExtraKgCents: 20000,
      effectiveFrom: future,
    };
    expect((await rejection(pricing.createPrice({ ...base, destinationZoneId: colombo.id }))).code).toBe(
      "INVALID_ROUTE",
    );
    expect(
      (await rejection(pricing.createPrice({ ...base, effectiveFrom: new Date(Date.now() - 1000).toISOString() })))
        .code,
    ).toBe("INVALID_EFFECTIVE_DATE");
    await db.zone.update({ where: { id: kandy.id }, data: { active: false } });
    expect((await rejection(pricing.createPrice(base))).code).toBe("ZONE_INACTIVE");
    await db.zone.update({ where: { id: kandy.id }, data: { active: true } });
    const created = await pricing.createPrice(base);
    expect(created.baseCents).toBe(60000);
    const listed = await pricing.listPrices();
    expect(listed[0]!.id).toBe(created.id);
    expect(listed).toHaveLength(2);
    // A future price does not change what is quoted today.
    expect((await pricing.createQuote(customerId, route)).feeCents).toBe(57000);
  });
});

describe("booking from a quote (FR-P3)", () => {
  it("creates the parcel, consumes the quote and writes the history and one event together", async () => {
    const { quote, parcel } = await book();
    expect(trackingNumberSchema.safeParse(parcel.trackingNumber).success).toBe(true);
    expect(parcel).toMatchObject({
      status: "CREATED",
      feeCents: 57000,
      currency: "LKR",
      recipientPhone: "+94771234567",
      originTown: "Colombo",
      destinationTown: "Kandy",
    });
    expect(parcel.history.map((h) => h.status)).toEqual(["CREATED"]);
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).consumedAt).not.toBeNull();
    const events = await db.outboxEvent.findMany({ where: { aggregateId: parcel.id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("parcel.created");
    expect(events[0]!.payload).toMatchObject({
      version: 1,
      sequence: 1,
      data: { trackingNo: parcel.trackingNumber, customerId: String(customerId), feeCents: 57000 },
    });
  });

  it("keeps recipient contact data out of the event (NFR-4)", async () => {
    const { parcel } = await book();
    const event = await db.outboxEvent.findFirstOrThrow({ where: { aggregateId: parcel.id } });
    const text = JSON.stringify(event.payload);
    for (const secret of ["Kamal", "0771234567", "94771234567", "Temple Road"])
      expect(text).not.toContain(secret);
  });

  it("locks the price to the quote even if a newer price appears before booking", async () => {
    const quote = await pricing.createQuote(customerId, route);
    await db.priceVersion.create({
      data: {
        originZoneId: colombo.id,
        destinationZoneId: kandy.id,
        baseCents: 99000,
        perExtraKgCents: 99000,
        effectiveFrom: new Date("2022-01-01T00:00:00Z"),
      },
    });
    const parcel = await parcels.book(customerId, KEY, { quoteId: quote.id, ...recipient } as never);
    expect(parcel.feeCents).toBe(57000);
  });

  it("issues unpredictable, non-sequential tracking numbers", async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 6; i++)
      numbers.push((await book(customerId, `booking-key-${String(i).padStart(8, "0")}`)).parcel.trackingNumber);
    expect(new Set(numbers).size).toBe(6);
    for (const n of numbers) expect(trackingNumberSchema.safeParse(n).success).toBe(true);
  });

  it("returns the original parcel for a repeated key and rejects the same key with new details", async () => {
    const { quote, parcel } = await book();
    const again = await parcels.book(customerId, KEY, { quoteId: quote.id, ...recipient } as never);
    expect(again.id).toBe(parcel.id);
    expect(await db.parcel.count()).toBe(1);
    expect(await db.outboxEvent.count()).toBe(1);
    const changed = await rejection(
      parcels.book(customerId, KEY, { quoteId: quote.id, ...recipient, recipientName: "Someone Else" } as never),
    );
    expect([changed.status, changed.code]).toEqual([409, "IDEMPOTENCY_CONFLICT"]);
  });

  it("books a quote only once, however many requests race", async () => {
    const quote = await pricing.createQuote(customerId, route);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        parcels.book(customerId, `race-key-${String(i).padStart(10, "0")}`, {
          quoteId: quote.id,
          ...recipient,
        } as never),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    for (const o of outcomes.filter((o) => o.status === "rejected"))
      expect(((o as PromiseRejectedResult).reason as HttpError).status).toBe(409);
    expect(await db.parcel.count()).toBe(1);
  });

  it("returns one parcel when the identical request is sent concurrently", async () => {
    const quote = await pricing.createQuote(customerId, route);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        parcels.book(customerId, KEY, { quoteId: quote.id, ...recipient } as never),
      ),
    );
    expect(new Set(results.map((r) => r.trackingNumber)).size).toBe(1);
    expect(await db.parcel.count()).toBe(1);
  });

  it("refuses a used, foreign, unknown or expired quote and a malformed key", async () => {
    const { quote } = await book();
    expect(
      (await rejection(parcels.book(customerId, "second-key-00000001", { quoteId: quote.id, ...recipient } as never)))
        .code,
    ).toBe("QUOTE_USED");
    const mine = await pricing.createQuote(customerId, route);
    expect(
      (await rejection(parcels.book(otherId, "other-key-00000001", { quoteId: mine.id, ...recipient } as never)))
        .code,
    ).toBe("QUOTE_NOT_FOUND");
    expect(
      (
        await rejection(
          parcels.book(customerId, "unknown-key-0000001", {
            quoteId: "00000000-0000-4000-8000-000000000000",
            ...recipient,
          } as never),
        )
      ).status,
    ).toBe(404);
    await db.quote.update({ where: { id: mine.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await rejection(parcels.book(customerId, "expired-key-000001", { quoteId: mine.id, ...recipient } as never)))
        .status,
    ).toBe(410);
    for (const bad of ["short", "has spaces in the key!!", "x".repeat(129)])
      expect((await rejection(parcels.book(customerId, bad, { quoteId: mine.id, ...recipient } as never))).code).toBe(
        "IDEMPOTENCY_KEY",
      );
    expect(await db.parcel.count()).toBe(1);
  });

  it("expires stored keys after 24 hours so the key can be reused", async () => {
    const { parcel } = await book();
    await db.idempotencyRecord.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const quote = await pricing.createQuote(customerId, route);
    const next = await parcels.book(customerId, KEY, { quoteId: quote.id, ...recipient } as never);
    expect(next.id).not.toBe(parcel.id);
  });
});

describe("customer records and public tracking (FR-P6, FR-P7)", () => {
  async function insertParcel(userId: number, createdAt: Date) {
    const n = ++counter;
    const quote = await db.quote.create({
      data: {
        userId,
        originZoneId: colombo.id,
        destinationZoneId: kandy.id,
        priceVersionId: (await db.priceVersion.findFirstOrThrow()).id,
        weightGrams: 1000,
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
        feeCents: 45000,
        expiresAt: new Date(Date.now() + 600_000),
        consumedAt: createdAt,
      },
    });
    return db.parcel.create({
      data: {
        trackingNumber: `SD${String(n).padStart(8, "0")}`,
        userId,
        quoteId: quote.id,
        originZoneId: colombo.id,
        destinationZoneId: kandy.id,
        feeCents: 45000,
        createdAt,
        recipientName: "Recipient",
        recipientPhone: "+94771234567",
        recipientAddress: "1 Test Road",
        history: { create: { status: "CREATED", town: "Colombo", createdAt } },
      },
    });
  }

  it("pages the customer's own bookings newest first and never shows another customer's", async () => {
    const mine: string[] = [];
    for (let i = 0; i < 22; i++)
      mine.push((await insertParcel(customerId, new Date(Date.UTC(2026, 0, 1, 0, i)))).id);
    const foreign = await insertParcel(otherId, new Date(Date.UTC(2026, 5, 1)));

    const first = await parcels.list(customerId);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]!.id).toBe(mine[21]);
    expect(first.nextCursor).toBe(first.items[19]!.id);
    const second = await parcels.list(customerId, first.nextCursor!);
    expect(second.items.map((p) => p.id)).toEqual([mine[1], mine[0]]);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].some((p) => p.id === foreign.id)).toBe(false);
    expect((await rejection(parcels.list(customerId, foreign.id))).code).toBe("INVALID_CURSOR");
  });

  it("shows detail to the owner and hides it from everyone else with 404", async () => {
    const { parcel } = await book();
    expect((await parcels.detail(customerId, parcel.id)).trackingNumber).toBe(parcel.trackingNumber);
    expect((await rejection(parcels.detail(otherId, parcel.id))).status).toBe(404);
    expect(
      (await rejection(parcels.detail(customerId, "00000000-0000-4000-8000-000000000000"))).status,
    ).toBe(404);
  });

  it("tracks publicly with status, time and town only", async () => {
    const { parcel } = await book();
    const tracked = await parcels.track(parcel.trackingNumber);
    expect(Object.keys(tracked).sort()).toEqual(
      ["destinationTown", "history", "originTown", "status", "trackingNumber"],
    );
    expect(Object.keys(tracked.history[0]!).sort()).toEqual(["createdAt", "status", "town"]);
    const text = JSON.stringify(tracked);
    for (const secret of ["Kamal", "94771234567", "Temple Road", "57000"])
      expect(text).not.toContain(secret);
    expect((await rejection(parcels.track("SD00000000"))).status).toBe(404);
  });
});

describe("merchant orders (FR-M4)", () => {
  const order = { ...route, ...recipient };
  async function merchant(
    status: "PENDING" | "APPROVED" = "APPROVED",
    userStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE",
  ) {
    const user = await newUser("MERCHANT", userStatus);
    return db.merchant.create({
      data: {
        userId: user.id,
        businessName: `Shop ${user.id}`,
        status,
        ...(status === "PENDING" ? {} : { reviewedAt: new Date() }),
      },
    });
  }

  it("prices from the route, records the merchant and writes one envelope event", async () => {
    const m = await merchant();
    const parcel = await parcels.createMerchantOrder(m.id, KEY, order as never);
    expect(parcel).toMatchObject({ status: "CREATED", feeCents: 57000 });
    const row = await db.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
    expect(row).toMatchObject({ merchantId: m.id, userId: m.userId });
    const events = await db.outboxEvent.findMany({ where: { aggregateId: parcel.id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      type: "parcel.created",
      version: 1,
      data: { merchantId: m.id, trackingNo: parcel.trackingNumber },
    });
    expect(JSON.stringify(events[0]!.payload)).not.toContain("Kamal");
    expect(
      (await db.quote.findUniqueOrThrow({ where: { id: row.quoteId } })).consumedAt,
    ).not.toBeNull();
  });

  it("matches districts case-insensitively", async () => {
    const m = await merchant();
    const parcel = await parcels.createMerchantOrder(m.id, KEY, {
      ...order,
      originDistrict: "COLOMBO",
      destinationDistrict: "kandy",
    } as never);
    expect(parcel.feeCents).toBe(57000);
  });

  it("returns the original order for a repeated key and conflicts on changed details", async () => {
    const m = await merchant();
    const first = await parcels.createMerchantOrder(m.id, KEY, order as never);
    expect((await parcels.createMerchantOrder(m.id, KEY, order as never)).id).toBe(first.id);
    expect(await db.parcel.count()).toBe(1);
    expect(
      (await rejection(parcels.createMerchantOrder(m.id, KEY, { ...order, weightGrams: 3000 } as never))).code,
    ).toBe("IDEMPOTENCY_CONFLICT");
    // The same key from a different merchant is an unrelated request.
    const other = await merchant();
    expect((await parcels.createMerchantOrder(other.id, KEY, order as never)).id).not.toBe(first.id);
  });

  it("creates one order when the same request is sent concurrently", async () => {
    const m = await merchant();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => parcels.createMerchantOrder(m.id, KEY, order as never)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db.parcel.count()).toBe(1);
  });

  it("refuses unapproved, suspended and unknown merchants and bad keys before creating anything", async () => {
    const pending = await merchant("PENDING");
    const suspended = await merchant("APPROVED", "SUSPENDED");
    for (const id of [pending.id, suspended.id])
      expect((await rejection(parcels.createMerchantOrder(id, KEY, order as never))).code).toBe(
        "MERCHANT_NOT_APPROVED",
      );
    expect(
      (await rejection(parcels.createMerchantOrder("00000000-0000-4000-8000-000000000000", KEY, order as never)))
        .code,
    ).toBe("MERCHANT_NOT_FOUND");
    const ok = await merchant();
    expect((await rejection(parcels.createMerchantOrder(ok.id, "short", order as never))).code).toBe(
      "IDEMPOTENCY_KEY",
    );
    expect(await db.parcel.count()).toBe(0);
    expect(await db.outboxEvent.count()).toBe(0);
  });

  it("refuses unserved, identical and unpriced routes with 422 and rolls everything back", async () => {
    const m = await merchant();
    expect(
      (await rejection(parcels.createMerchantOrder(m.id, KEY, { ...order, originDistrict: "Nowhere" } as never)))
        .code,
    ).toBe("UNSERVED_AREA");
    expect(
      (await rejection(parcels.createMerchantOrder(m.id, KEY, { ...order, destinationDistrict: "Colombo" } as never)))
        .code,
    ).toBe("INVALID_ROUTE");
    await db.zone.create({ data: { district: "Galle", town: "Galle" } });
    expect(
      (await rejection(parcels.createMerchantOrder(m.id, KEY, { ...order, destinationDistrict: "Galle" } as never)))
        .code,
    ).toBe("PRICE_UNAVAILABLE");
    expect(await db.quote.count()).toBe(0);
    expect(await db.parcel.count()).toBe(0);
    expect(await db.idempotencyRecord.count()).toBe(0);
  });
});
