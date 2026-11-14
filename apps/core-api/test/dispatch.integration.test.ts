import {
  afterAll,
  beforeAll,
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
import { randomUUID, generateKeyPairSync } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { Redis } from "ioredis";
import {
  createDatabase,
  type Database,
  RoleName,
} from "@swiftdrop/db";
import { createApp } from "../src/app.js";
import { createTokenService } from "../src/modules/auth/jwt.js";
import type { Config } from "../src/shared/config.js";
import pino from "pino";

const root = resolve(import.meta.dirname, "../../..");
const password = "Dispatch integration passphrase!";
const origin = "http://localhost:5173";
const postgresImage =
  "postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b";
const redisImage =
  "redis:7-alpine@sha256:8da19c7399dca900c6822a1cf30f9d2285585e2c4b457ff4095b0f4500054d3f";
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let postgres: StartedTestContainer;
let redisContainer: StartedTestContainer;
let db: Database;
let redis: Redis;
let api: ReturnType<typeof createApp>;
let config: Config;
let passwordHash: string;
let sequence = 0;
let zones: { pickup: number; alternatePickup: number; destination: number };

async function createUser(role: RoleName, label: string) {
  return db.user.create({
    data: {
      email: `${role.toLowerCase()}-${label}-${randomUUID()}@example.test`,
      fullName: `${label} ${role}`,
      phone: "+94771234567",
      passwordHash,
      emailVerifiedAt: new Date(),
      roleId: role,
      status: "ACTIVE",
    },
  });
}

async function accessToken(role: RoleName, label: string) {
  const user = await createUser(role, label);
  const session = await api.service.login(user.email, password);
  return { user, token: session.response.accessToken };
}

async function createParcel(originZoneId = zones.pickup) {
  const customer = await createUser("CUSTOMER", `parcel-${sequence}`);
  const quote = await db.quote.create({
    data: {
      userId: customer.id,
      originZoneId,
      destinationZoneId: zones.destination,
      priceVersionId: 1,
      weightGrams: 500,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
      feeCents: 50000,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const parcel = await db.parcel.create({
    data: {
      trackingNumber: `SD${String(++sequence).padStart(8, "0")}`,
      userId: customer.id,
      quoteId: quote.id,
      originZoneId,
      destinationZoneId: zones.destination,
      feeCents: quote.feeCents,
      recipientName: "Integration Recipient",
      recipientPhone: "+94771234567",
      recipientAddress: "Integration test address",
      history: {
        create: {
          status: "CREATED",
          town: "Colombo",
        },
      },
    },
  });
  return parcel;
}

async function createCourier(
  label: string,
  options: { onDuty?: boolean; maxCapacity?: number; currentWorkload?: number } = {},
) {
  const user = await createUser("COURIER", label);
  const profile = await db.courierProfile.create({
    data: {
      userId: user.id,
      onDuty: options.onDuty ?? true,
      maxCapacity: options.maxCapacity ?? 2,
      currentWorkload: options.currentWorkload ?? 0,
    },
  });
  return { user, profile };
}

async function mutation(
  token: string,
  method: "put",
  path: string,
  body: object,
) {
  const csrf = await request(api.app).get("/api/v1/auth/csrf").expect(200);
  const rawCookies = csrf.headers["set-cookie"];
  const cookies = (Array.isArray(rawCookies)
    ? rawCookies
    : rawCookies
      ? [rawCookies]
      : []
  )
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  return request(api.app)[method](path)
    .set("Authorization", `Bearer ${token}`)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf.body.csrfToken)
    .set("Cookie", cookies)
    .send(body);
}

beforeAll(async () => {
  postgres = await new GenericContainer(postgresImage)
    .withEnvironment({
      POSTGRES_USER: "m06_test",
      POSTGRES_PASSWORD: "m06_test",
      POSTGRES_DB: "m06_dispatch_test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  redisContainer = await new GenericContainer(redisImage)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();

  const databaseURL = `postgresql://m06_test:m06_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/m06_dispatch_test`;
  execFileSync(
    packageManager,
    ["--filter", "@swiftdrop/db", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseURL },
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );
  db = createDatabase(databaseURL);
  redis = new Redis({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  redis.on("error", () => {});
  if (redis.status !== "ready")
    await new Promise<void>((done) => redis.once("ready", done));

  const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
  config = {
    NODE_ENV: "test",
    PORT: 3000,
    INTERNAL_PORT: 3001,
    APP_ORIGIN: origin,
    SMTP_URL: "smtp://localhost:1025",
    API_ISSUER: "http://localhost:3000",
    HUMAN_AUDIENCE: "swiftdrop-web",
    SERVICE_ISSUER: "http://127.0.0.1:3001",
    DATABASE_URL: databaseURL,
    REDIS_URL: "",
    RABBITMQ_URL: "amqp://localhost",
    MINIO_ENDPOINT: "http://localhost:9000",
    MINIO_ACCESS_KEY: "test",
    MINIO_SECRET_KEY: "test-secret",
    MINIO_BUCKET: "test-receipts",
    AUTH_KEY_ID: "m06-test-1",
    AUTH_PRIVATE_KEY_FILE: "",
    AUTH_PUBLIC_KEYS_FILE: "",
    CSRF_SECRET_FILE: "",
    RATE_LIMIT_SECRET_FILE: "",
    OAUTH_TRANSACTION_SECRET_FILE: "",
    oauthSecret: "c".repeat(64),
    COOKIE_SECURE: "false",
    secure: false,
    root,
    privateKey: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeys: {
      "m06-test-1": pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
    csrfSecret: "a".repeat(64),
    rateSecret: "b".repeat(64),
    CUSTOMER_IDLE_SECONDS: 604800,
    CUSTOMER_ABSOLUTE_SECONDS: 2592000,
    STAFF_IDLE_SECONDS: 43200,
    STAFF_ABSOLUTE_SECONDS: 86400,
  };
  const tokens = await createTokenService(config);
  api = createApp({
    db,
    redis,
    config,
    tokens,
    logger: pino({ enabled: false }),
  });
  passwordHash = await bcrypt.hash(password, 4);

  for (const role of Object.values(RoleName))
    await db.role.upsert({
      where: { id: role },
      update: {},
      create: { id: role },
    });
  const pickup = await db.zone.create({
    data: { district: "M06 Pickup", town: "Colombo" },
  });
  const alternatePickup = await db.zone.create({
    data: { district: "M06 Alternate", town: "Galle" },
  });
  const destination = await db.zone.create({
    data: { district: "M06 Destination", town: "Kandy" },
  });
  await db.priceVersion.create({
    data: {
      originZoneId: pickup.id,
      destinationZoneId: destination.id,
      baseCents: 50000,
      perExtraKgCents: 10000,
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  zones = {
    pickup: pickup.id,
    alternatePickup: alternatePickup.id,
    destination: destination.id,
  };
}, 240000);

afterAll(async () => {
  await db?.$disconnect();
  if (redis) await redis.quit();
  await redisContainer?.stop();
  await postgres?.stop();
}, 240000);

describe("M06 dispatch API", () => {
  it("returns unassigned parcels in FIFO order and filters by pickup zone", async () => {
    const first = await createParcel(zones.pickup);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createParcel(zones.pickup);
    await createParcel(zones.alternatePickup);
    const dispatcher = await accessToken("DISPATCHER", "queue");

    const response = await request(api.app)
      .get(`/api/v1/dispatch/parcels/unassigned?pickupZoneId=${zones.pickup}`)
      .set("Authorization", `Bearer ${dispatcher.token}`)
      .expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("reports courier capacity and assigns an available courier", async () => {
    const parcel = await createParcel();
    const courier = await createCourier("available");
    const dispatcher = await accessToken("DISPATCHER", "assign");

    const before = await request(api.app)
      .get("/api/v1/dispatch/couriers/capacity")
      .set("Authorization", `Bearer ${dispatcher.token}`)
      .expect(200);
    expect(
      before.body.items.find(
        (item: { courierUserId: number }) =>
          item.courierUserId === courier.user.id,
      ),
    ).toMatchObject({ currentWorkload: 0, availableCapacity: 2 });

    const assignment = await mutation(
      dispatcher.token,
      "put",
      `/api/v1/dispatch/parcels/${parcel.id}/assignment`,
      { courierUserId: courier.user.id, dispatchVersion: parcel.dispatchVersion },
    );
    expect(assignment.status).toBe(200);
    expect(assignment.body).toMatchObject({
      parcelId: parcel.id,
      courierUserId: courier.user.id,
      status: "ACTIVE",
    });
  });

  it("rejects off-duty and full-capacity couriers", async () => {
    const offDutyParcel = await createParcel();
    const fullParcel = await createParcel();
    const offDuty = await createCourier("off-duty", { onDuty: false });
    const full = await createCourier("full", {
      maxCapacity: 1,
      currentWorkload: 1,
    });
    const dispatcher = await accessToken("DISPATCHER", "availability");

    const offDutyResponse = await mutation(
      dispatcher.token,
      "put",
      `/api/v1/dispatch/parcels/${offDutyParcel.id}/assignment`,
      { courierUserId: offDuty.user.id, dispatchVersion: offDutyParcel.dispatchVersion },
    );
    const fullResponse = await mutation(
      dispatcher.token,
      "put",
      `/api/v1/dispatch/parcels/${fullParcel.id}/assignment`,
      { courierUserId: full.user.id, dispatchVersion: fullParcel.dispatchVersion },
    );

    expect(offDutyResponse.status).toBe(409);
    expect(fullResponse.status).toBe(409);
  });

  it("reassigns a parcel and updates both courier workloads", async () => {
    const parcel = await createParcel();
    const first = await createCourier("first");
    const second = await createCourier("second");
    const dispatcher = await accessToken("DISPATCHER", "reassign");

    const firstAssignment = await mutation(
      dispatcher.token,
      "put",
      `/api/v1/dispatch/parcels/${parcel.id}/assignment`,
      { courierUserId: first.user.id, dispatchVersion: parcel.dispatchVersion },
    );
    const reassignment = await mutation(
      dispatcher.token,
      "put",
      `/api/v1/dispatch/parcels/${parcel.id}/assignment`,
      {
        courierUserId: second.user.id,
        dispatchVersion: firstAssignment.body.dispatchVersion,
      },
    );

    expect(reassignment.status).toBe(200);
    const activeAssignments = await request(api.app)
      .get(`/api/v1/dispatch/assignments?courierUserId=${second.user.id}`)
      .set("Authorization", `Bearer ${dispatcher.token}`)
      .expect(200);
    expect(activeAssignments.body.items).toHaveLength(1);
    expect(activeAssignments.body.items[0]).toMatchObject({
      id: reassignment.body.id,
      parcelId: parcel.id,
      courierUserId: second.user.id,
      status: "ACTIVE",
    });

    await request(api.app)
      .get(`/api/v1/dispatch/assignments/${reassignment.body.id}`)
      .set("Authorization", `Bearer ${dispatcher.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: reassignment.body.id,
          parcelId: parcel.id,
          dispatchVersion: reassignment.body.dispatchVersion,
        });
      });

    await request(api.app)
      .get(`/api/v1/dispatch/parcels/${parcel.id}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.assignment).toMatchObject({
          id: reassignment.body.id,
          courierUserId: second.user.id,
        });
        expect(body.parcel).toMatchObject({
          id: parcel.id,
          dispatchVersion: reassignment.body.dispatchVersion,
        });
      });

    const history = await request(api.app)
      .get(`/api/v1/dispatch/history?search=${parcel.trackingNumber}`)
      .set("Authorization", `Bearer ${dispatcher.token}`)
      .expect(200);
    expect(history.body.items.map((item: { status: string }) => item.status).sort()).toEqual([
      "ACTIVE",
      "RELEASED",
    ]);

    const profiles = await db.courierProfile.findMany({
      where: { userId: { in: [first.user.id, second.user.id] } },
      orderBy: { userId: "asc" },
    });
    expect(profiles.map((profile) => profile.currentWorkload)).toEqual([0, 1]);
  });

  it("rejects stale dispatch revisions", async () => {
    const parcel = await createParcel();
    const courier = await createCourier("stale");
    const dispatcher = await accessToken("DISPATCHER", "stale");

    const response = await mutation(
      dispatcher.token,
      "put",
      `/api/v1/dispatch/parcels/${parcel.id}/assignment`,
      { courierUserId: courier.user.id, dispatchVersion: parcel.dispatchVersion + 1 },
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("VERSION_CONFLICT");
  });

  it("rejects unauthenticated and customer access", async () => {
    const unauthenticated = await request(api.app)
      .get("/api/v1/dispatch/couriers/capacity")
      .expect(401);
    expect(unauthenticated.body.code).toBe("UNAUTHENTICATED");

    const customer = await accessToken("CUSTOMER", "unauthorized");
    await request(api.app)
      .get("/api/v1/dispatch/couriers/capacity")
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(403);

  });

  it("serializes simultaneous assignment requests for the same parcel", async () => {
    const parcel = await createParcel();
    const first = await createCourier("race-first", { maxCapacity: 1 });
    const second = await createCourier("race-second", { maxCapacity: 1 });
    const dispatcher = await accessToken("DISPATCHER", "race");

    const responses = await Promise.all([
      mutation(
        dispatcher.token,
        "put",
        `/api/v1/dispatch/parcels/${parcel.id}/assignment`,
        { courierUserId: first.user.id, dispatchVersion: parcel.dispatchVersion },
      ),
      mutation(
        dispatcher.token,
        "put",
        `/api/v1/dispatch/parcels/${parcel.id}/assignment`,
        { courierUserId: second.user.id, dispatchVersion: parcel.dispatchVersion },
      ),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      409,
    ]);
    const active = await db.courierAssignment.findMany({
      where: { parcelId: parcel.id, status: "ACTIVE" },
    });
    expect(active).toHaveLength(1);
    const profiles = await db.courierProfile.findMany({
      where: { userId: { in: [first.user.id, second.user.id] } },
    });
    expect(profiles.every((profile) => profile.currentWorkload <= profile.maxCapacity)).toBe(
      true,
    );
  });

  it("does not exceed capacity when two parcels compete for the final slot", async () => {
    const firstParcel = await createParcel();
    const secondParcel = await createParcel();
    const courier = await createCourier("slot", { maxCapacity: 1 });
    const dispatcher = await accessToken("DISPATCHER", "slot");

    const responses = await Promise.all([
      mutation(
        dispatcher.token,
        "put",
        `/api/v1/dispatch/parcels/${firstParcel.id}/assignment`,
        { courierUserId: courier.user.id, dispatchVersion: firstParcel.dispatchVersion },
      ),
      mutation(
        dispatcher.token,
        "put",
        `/api/v1/dispatch/parcels/${secondParcel.id}/assignment`,
        { courierUserId: courier.user.id, dispatchVersion: secondParcel.dispatchVersion },
      ),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      409,
    ]);
    const profile = await db.courierProfile.findUniqueOrThrow({
      where: { id: courier.profile.id },
    });
    expect(profile.currentWorkload).toBe(1);
    expect(profile.currentWorkload).toBeLessThanOrEqual(profile.maxCapacity);
  });
});
