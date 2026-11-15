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
import { Client } from "minio";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createDatabase, type Database } from "@swiftdrop/db";
import { ReceiptService } from "../src/modules/receipts/service.js";
import type { Config } from "../src/shared/config.js";
import { HttpError } from "../src/shared/problem.js";

/**
 * Receipt generation against a real MinIO and PostgreSQL (handover: "receipt generation on
 * DELIVERED has not been exercised against a live MinIO"). Override the image with
 * MINIO_TEST_IMAGE; it defaults to the digest Compose pins.
 */
const root = resolve(import.meta.dirname, "../../..");
// The config's testTimeout is not applied per project, so state it: cold PDF/broker work is slow.
jest.setTimeout(60_000);
const MINIO_IMAGE =
  process.env.MINIO_TEST_IMAGE ??
  "elestio/minio:latest@sha256:25348a257f1ece1b192f25f6cd9854618fa86422ac87b494b5d4e629c556d4bd";
const ACCESS = "test-access";
const SECRET = "test-secret-key-123";
const BUCKET = "test-receipts";

let postgres: StartedTestContainer;
let minio: StartedTestContainer;
let db: Database;
let receipts: ReceiptService;
let storage: Client;
let counter = 0;

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
  [postgres, minio] = await Promise.all([
    new GenericContainer("postgres:17-alpine")
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "receipts_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections", 2),
      )
      .start(),
    new GenericContainer(MINIO_IMAGE)
      .withCommand(["server", "/data"])
      .withEnvironment({ MINIO_ROOT_USER: ACCESS, MINIO_ROOT_PASSWORD: SECRET })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000))
      .start(),
  ]);
  const url = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/receipts_test`;
  migrate(url);
  db = createDatabase(url);
  for (const role of ["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"] as const)
    await db.role.upsert({ where: { id: role }, update: {}, create: { id: role } });
  const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  receipts = new ReceiptService(db, {
    MINIO_ENDPOINT: endpoint,
    MINIO_ACCESS_KEY: ACCESS,
    MINIO_SECRET_KEY: SECRET,
    MINIO_BUCKET: BUCKET,
  } as Config);
  storage = new Client({
    endPoint: minio.getHost(),
    port: minio.getMappedPort(9000),
    useSSL: false,
    accessKey: ACCESS,
    secretKey: SECRET,
  });
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  await Promise.allSettled([postgres?.stop(), minio?.stop()]);
}, 60_000);

let ownerId: number;
let strangerId: number;
let originId: number;
let destinationId: number;
let priceVersionId: number;

async function newUser(role: "CUSTOMER") {
  counter += 1;
  return db.user.create({
    data: {
      email: `${role.toLowerCase()}${counter}@example.test`,
      fullName: `Test ${counter}`,
      phone: "+94771234567",
      roleId: role,
    },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "parcel_receipts","parcel_history","parcels","quotes","price_versions","zones","users" RESTART IDENTITY CASCADE',
  );
  ownerId = (await newUser("CUSTOMER")).id;
  strangerId = (await newUser("CUSTOMER")).id;
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
});

async function newParcel(status: "CREATED" | "DELIVERED") {
  const serial = ++counter;
  const quote = await db.quote.create({
    data: {
      userId: ownerId,
      originZoneId: originId,
      destinationZoneId: destinationId,
      priceVersionId,
      weightGrams: 2000,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
      feeCents: 57000,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  return db.parcel.create({
    data: {
      trackingNumber: `SD-R${String(serial).padStart(7, "0")}-X`,
      userId: ownerId,
      quoteId: quote.id,
      originZoneId: originId,
      destinationZoneId: destinationId,
      feeCents: 57000,
      status,
      recipientName: "Recipient Person",
      recipientPhone: "+94771234567",
      recipientAddress: "1 Test Road",
      history: {
        create:
          status === "DELIVERED"
            ? [
                { status: "CREATED", town: "Colombo" },
                { status: "DELIVERED", town: "Kandy" },
              ]
            : [{ status: "CREATED", town: "Colombo" }],
      },
    },
  });
}

const readObject = async (key: string) => {
  const stream = await storage.getObject(BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

async function status(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
  throw new Error("expected the call to be rejected");
}

describe("delivery receipts against live MinIO and PostgreSQL", () => {
  it("creates the bucket and stores a real PDF for a delivered parcel", async () => {
    const parcel = await newParcel("DELIVERED");
    const receipt = await receipts.generateForDelivered(parcel.id);
    expect(receipt).toMatchObject({
      parcelId: parcel.id,
      reference: `SDR-${parcel.trackingNumber}`,
      objectKey: `receipts/${parcel.id}.pdf`,
    });
    expect(await storage.bucketExists(BUCKET)).toBe(true);
    const pdf = await readObject(receipt!.objectKey);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("is idempotent: a replayed delivered event keeps one receipt and one object", async () => {
    const parcel = await newParcel("DELIVERED");
    const first = await receipts.generateForDelivered(parcel.id);
    const second = await receipts.generateForDelivered(parcel.id);
    expect(second!.id).toBe(first!.id);
    expect(await db.receipt.count({ where: { parcelId: parcel.id } })).toBe(1);
    const stat = await storage.statObject(BUCKET, first!.objectKey);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("converges when two workers generate the same receipt concurrently", async () => {
    const parcel = await newParcel("DELIVERED");
    const results = await Promise.all([
      receipts.generateForDelivered(parcel.id),
      receipts.generateForDelivered(parcel.id),
      receipts.generateForDelivered(parcel.id),
    ]);
    expect(new Set(results.map((r) => r!.id)).size).toBe(1);
    expect(await db.receipt.count({ where: { parcelId: parcel.id } })).toBe(1);
  });

  it("writes nothing for a parcel that is not delivered", async () => {
    const parcel = await newParcel("CREATED");
    expect(await receipts.generateForDelivered(parcel.id)).toBeNull();
    expect(await db.receipt.count()).toBe(0);
  });

  it("serves the owner a short-lived signed URL that downloads the PDF", async () => {
    const parcel = await newParcel("DELIVERED");
    await receipts.generateForDelivered(parcel.id);
    const link = await receipts.getDownloadUrl(ownerId, parcel.id);
    expect(link.receiptReference).toBe(`SDR-${parcel.trackingNumber}`);
    expect(new URL(link.downloadUrl).searchParams.get("X-Amz-Expires")).toBe(
      "300",
    );
    const response = await fetch(link.downloadUrl);
    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // The object itself is private: no signature, no access.
    const bare = await fetch(link.downloadUrl.split("?")[0]!);
    expect(bare.status).toBe(403);
  });

  it("hides another customer's receipt behind 404 and refuses undelivered parcels with 409", async () => {
    const delivered = await newParcel("DELIVERED");
    await receipts.generateForDelivered(delivered.id);
    expect(await status(receipts.getDownloadUrl(strangerId, delivered.id))).toBe(
      404,
    );
    const pending = await newParcel("CREATED");
    expect(await status(receipts.getDownloadUrl(ownerId, pending.id))).toBe(409);
  });

  it("regenerates the PDF when the object is missing from storage", async () => {
    const parcel = await newParcel("DELIVERED");
    const receipt = await receipts.generateForDelivered(parcel.id);
    await storage.removeObject(BUCKET, receipt!.objectKey);
    const link = await receipts.getDownloadUrl(ownerId, parcel.id);
    const response = await fetch(link.downloadUrl);
    expect(response.status).toBe(200);
    expect((await readObject(receipt!.objectKey)).length).toBeGreaterThan(1000);
  });
});
