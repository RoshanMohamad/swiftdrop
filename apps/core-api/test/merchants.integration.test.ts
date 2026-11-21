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
import { createHash, generateKeyPairSync } from "node:crypto";
import { resolve } from "node:path";
import { createDatabase, type Database } from "@swiftdrop/db";
import { MerchantsService } from "../src/modules/merchants/service.js";
import { OAuthProtocolError } from "../src/modules/merchants/oauth-error.js";
import {
  createTokenService,
  type TokenService,
} from "../src/modules/auth/jwt.js";
import { HttpError } from "../src/shared/problem.js";

/**
 * M02 against a real PostgreSQL: registration, approval, API client credentials, OAuth client
 * credentials, webhook settings and the merchant-scoped order list. The ownership, approval and
 * revocation rules are the security surface (DD §9.3, auth plan §5).
 */
const root = resolve(import.meta.dirname, "../../..");
jest.setTimeout(60_000);
const WEBHOOK_ROOT = "test-webhook-secret-root";
const PASSWORD = "Local demo passphrase 2026!";

let container: StartedTestContainer;
let db: Database;
let tokens: TokenService;
let service: MerchantsService;
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
  container = await new GenericContainer("postgres:17-alpine")
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "merchants_test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  const url = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/merchants_test`;
  migrate(url);
  db = createDatabase(url);
  for (const role of ["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"] as const)
    await db.role.upsert({ where: { id: role }, update: {}, create: { id: role } });
  const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
  tokens = await createTokenService({
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeys: {
      k1: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    AUTH_KEY_ID: "k1",
    API_ISSUER: "https://issuer.example.test",
    HUMAN_AUDIENCE: "swiftdrop-human",
  });
  service = new MerchantsService(db, tokens, WEBHOOK_ROOT);
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  await container?.stop();
}, 60_000);

let adminId: number;

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "access_grants","merchant_webhook_configs","merchant_api_clients","parcel_history","parcels","quotes","price_versions","zones","merchants","users" RESTART IDENTITY CASCADE',
  );
  adminId = (
    await db.user.create({
      data: {
        email: "admin@example.test",
        fullName: "Admin",
        phone: "+94771234567",
        roleId: "ADMIN",
      },
    })
  ).id;
});

const registration = (suffix: string) => ({
  fullName: `Merchant ${suffix}`,
  email: `shop${suffix}@example.test`,
  phone: "+94771234567",
  password: PASSWORD,
  businessName: `Shop ${suffix}`,
});

/** A merchant in the given state, owned by a fresh user. */
async function newMerchant(
  status: "PENDING" | "APPROVED" | "REJECTED" = "APPROVED",
  userStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE",
) {
  const n = ++counter;
  const user = await db.user.create({
    data: {
      email: `owner${n}@example.test`,
      fullName: `Owner ${n}`,
      phone: "+94771234567",
      roleId: "MERCHANT",
      status: userStatus,
    },
  });
  const merchant = await db.merchant.create({
    data: {
      userId: user.id,
      businessName: `Business ${n}`,
      status,
      ...(status === "PENDING" ? {} : { reviewedAt: new Date() }),
    },
  });
  return { user, merchant };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to be rejected");
}
const httpError = async (promise: Promise<unknown>) => {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
};
const oauthError = async (promise: Promise<unknown>) => {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(OAuthProtocolError);
  return error as OAuthProtocolError;
};

describe("registration and review", () => {
  it("creates the merchant user and a PENDING profile together", async () => {
    const result = await service.register(registration("a") as never);
    expect(result.message).toMatch(/pending review/);
    const user = await db.user.findUniqueOrThrow({
      where: { email: "shopa@example.test" },
      include: { merchant: true },
    });
    expect(user).toMatchObject({ roleId: "MERCHANT", status: "ACTIVE" });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.merchant).toMatchObject({
      status: "PENDING",
      businessName: "Shop a",
      reviewedAt: null,
    });
  });

  it("answers a duplicate email the same way and changes nothing", async () => {
    await service.register(registration("a") as never);
    const before = await db.user.findUniqueOrThrow({
      where: { email: "shopa@example.test" },
    });
    const again = await service.register({
      ...registration("a"),
      businessName: "Hijack",
      password: "A different long passphrase 2026!",
    } as never);
    expect(again.message).toMatch(/pending review/);
    const after = await db.user.findUniqueOrThrow({
      where: { email: "shopa@example.test" },
      include: { merchant: true },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.merchant?.businessName).toBe("Shop a");
    expect(await db.merchant.count()).toBe(1);
  });

  it("lists applications for the admin with contact details", async () => {
    await service.register(registration("a") as never);
    await service.register(registration("b") as never);
    const page = await service.listForAdmin();
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ status: "PENDING", reviewedAt: null });
  });

  it("approves once, records the reviewer, and refuses a second decision", async () => {
    const { merchant } = await newMerchant("PENDING");
    const approved = await service.review(merchant.id, adminId, "APPROVED");
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedAt).not.toBeNull();
    expect(
      (await db.merchant.findUniqueOrThrow({ where: { id: merchant.id } }))
        .reviewedById,
    ).toBe(adminId);
    expect(
      (await httpError(service.review(merchant.id, adminId, "REJECTED"))).code,
    ).toBe("MERCHANT_ALREADY_REVIEWED");
    expect(
      (await db.merchant.findUniqueOrThrow({ where: { id: merchant.id } })).status,
    ).toBe("APPROVED");
  });

  it("404s an unknown merchant and lets exactly one of two concurrent decisions win", async () => {
    expect(
      (
        await httpError(
          service.review("00000000-0000-4000-8000-000000000000", adminId, "APPROVED"),
        )
      ).status,
    ).toBe(404);
    const { merchant } = await newMerchant("PENDING");
    const outcomes = await Promise.allSettled([
      service.review(merchant.id, adminId, "APPROVED"),
      service.review(merchant.id, adminId, "REJECTED"),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const loser = outcomes.find((o) => o.status === "rejected")!;
    expect(((loser as PromiseRejectedResult).reason as HttpError).code).toBe(
      "MERCHANT_ALREADY_REVIEWED",
    );
  });
});

describe("approval gates every merchant capability", () => {
  it("refuses PENDING and REJECTED merchants with 403 and unknown users with 404", async () => {
    for (const status of ["PENDING", "REJECTED"] as const) {
      const { user } = await newMerchant(status);
      for (const call of [
        () => service.listApiClients(user.id),
        () => service.listOrders(user.id),
        () => service.createApiClient(user.id, { name: "Key", scopes: ["orders:read"] }),
        () => service.getWebhookSettings(user.id),
        () => service.saveWebhookSettings(user.id, { url: "https://8.8.8.8/h" }),
        () => service.rotateWebhookSecret(user.id),
        () => service.rotateApiClient(user.id, "00000000-0000-4000-8000-000000000000"),
        () => service.revokeApiClient(user.id, "00000000-0000-4000-8000-000000000000"),
      ])
        expect((await httpError(call())).code).toBe("MERCHANT_NOT_APPROVED");
    }
    expect((await httpError(service.listApiClients(999999))).code).toBe(
      "MERCHANT_NOT_FOUND",
    );
  });
});

describe("API clients", () => {
  it("shows the secret once and stores only its SHA-256", async () => {
    const { user, merchant } = await newMerchant();
    const created = await service.createApiClient(user.id, {
      name: "Store backend",
      scopes: ["orders:write", "orders:read"],
    });
    expect(created.clientSecret).toMatch(/^sd_sec_/);
    expect(created.client.clientId).toMatch(/^sd_cli_/);
    const row = await db.merchantApiClient.findUniqueOrThrow({
      where: { id: created.client.id },
    });
    expect(row.merchantId).toBe(merchant.id);
    expect(row.secretHash).toBe(
      createHash("sha256").update(created.clientSecret).digest("hex"),
    );
    expect(JSON.stringify(row)).not.toContain(created.clientSecret);
    const listed = await service.listApiClients(user.id);
    expect(listed.items).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.clientSecret);
    expect(JSON.stringify(listed)).not.toContain("secretHash");
  });

  it("validates input and caps active clients at ten, even under concurrency", async () => {
    const { user } = await newMerchant();
    for (const bad of [
      { name: "x", scopes: ["orders:read"] },
      { name: "Key", scopes: [] },
      { name: "Key", scopes: ["orders:read", "orders:read"] },
      { name: "Key", scopes: ["admin"] },
    ])
      await expect(service.createApiClient(user.id, bad as never)).rejects.toThrow();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 13 }, (_, i) =>
        service.createApiClient(user.id, { name: `Key ${i}`, scopes: ["orders:read"] }),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(10);
    const refused = outcomes.filter((o) => o.status === "rejected");
    expect(
      refused.every(
        (o) => ((o as PromiseRejectedResult).reason as HttpError).code === "CLIENT_LIMIT",
      ),
    ).toBe(true);
    // Revoking frees a slot.
    const first = (await service.listApiClients(user.id)).items[0]!;
    await service.revokeApiClient(user.id, first.id);
    await service.createApiClient(user.id, { name: "Replacement", scopes: ["orders:read"] });
  });

  it("rotation replaces the secret and kills tokens issued to the old one", async () => {
    const { user } = await newMerchant();
    const created = await service.createApiClient(user.id, {
      name: "Key",
      scopes: ["orders:read"],
    });
    const token = await service.issueOAuthToken(
      created.client.clientId,
      created.clientSecret,
    );
    expect(
      await service.authenticateOAuthToken(token.access_token),
    ).toMatchObject({ clientId: created.client.clientId });

    const rotated = await service.rotateApiClient(user.id, created.client.id);
    expect(rotated.clientSecret).not.toBe(created.clientSecret);
    expect(rotated.client.rotatedAt).not.toBeNull();
    expect(
      (await oauthError(service.authenticateOAuthToken(token.access_token))).code,
    ).toBe("invalid_client");
    expect(
      (
        await oauthError(
          service.issueOAuthToken(created.client.clientId, created.clientSecret),
        )
      ).code,
    ).toBe("invalid_client");
    expect(
      (await service.issueOAuthToken(created.client.clientId, rotated.clientSecret))
        .token_type,
    ).toBe("Bearer");
  });

  it("scopes rotation and revocation to the owner and makes revocation idempotent", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    const created = await service.createApiClient(mine.user.id, {
      name: "Key",
      scopes: ["orders:read"],
    });
    expect(
      (await httpError(service.rotateApiClient(theirs.user.id, created.client.id)))
        .status,
    ).toBe(404);
    expect(
      (await httpError(service.revokeApiClient(theirs.user.id, created.client.id)))
        .status,
    ).toBe(404);
    expect((await service.listApiClients(theirs.user.id)).items).toHaveLength(0);

    const token = await service.issueOAuthToken(
      created.client.clientId,
      created.clientSecret,
    );
    await service.revokeApiClient(mine.user.id, created.client.id);
    await service.revokeApiClient(mine.user.id, created.client.id);
    expect(
      (await oauthError(service.authenticateOAuthToken(token.access_token))).status,
    ).toBe(401);
    expect(
      (
        await oauthError(
          service.issueOAuthToken(created.client.clientId, created.clientSecret),
        )
      ).code,
    ).toBe("invalid_client");
    expect(
      (await httpError(service.rotateApiClient(mine.user.id, created.client.id))).code,
    ).toBe("CLIENT_REVOKED");
  });
});

describe("OAuth client credentials", () => {
  async function client(scopes: Array<"orders:read" | "orders:write"> = ["orders:read", "orders:write"]) {
    const owner = await newMerchant();
    const created = await service.createApiClient(owner.user.id, { name: "Key", scopes });
    return { ...owner, ...created };
  }

  it("issues a 15-minute bearer token with the granted scopes sorted", async () => {
    const c = await client();
    const response = await service.issueOAuthToken(c.client.clientId, c.clientSecret);
    expect(response).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "orders:read orders:write",
    });
    expect(await service.hasOAuthClient(c.client.clientId)).toBe(true);
    expect(await service.hasOAuthClient("sd_cli_nope")).toBe(false);
    const grant = await db.accessGrant.findFirstOrThrow({
      where: { clientId: c.client.id },
    });
    expect(grant.familyId).toBeNull();
    expect(grant.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900_000);
    expect(await service.authenticateOAuthToken(response.access_token)).toEqual({
      kind: "merchant-client",
      clientId: c.client.clientId,
      merchantId: c.merchant.id,
      scopes: ["orders:read", "orders:write"],
      jti: grant.jti,
    });
  });

  it("grants a subset on request and refuses unknown, duplicate, empty or foreign scopes", async () => {
    const c = await client(["orders:read"]);
    expect(
      (await service.issueOAuthToken(c.client.clientId, c.clientSecret, ["orders:read"]))
        .scope,
    ).toBe("orders:read");
    for (const requested of [
      ["orders:write"],
      ["orders:read", "orders:read"],
      [],
      ["admin:all"],
    ] as never[]) {
      const error = await oauthError(
        service.issueOAuthToken(c.client.clientId, c.clientSecret, requested),
      );
      expect(error).toMatchObject({ code: "invalid_scope", status: 400 });
    }
  });

  it("gives the same invalid_client answer for unknown clients and wrong secrets", async () => {
    const c = await client();
    const unknown = await oauthError(service.issueOAuthToken("sd_cli_unknown", "x"));
    const wrong = await oauthError(
      service.issueOAuthToken(c.client.clientId, "sd_sec_wrong"),
    );
    expect([unknown.code, unknown.status, unknown.message]).toEqual([
      wrong.code,
      wrong.status,
      wrong.message,
    ]);
    expect(wrong).toMatchObject({ code: "invalid_client", status: 401 });
  });

  it("stops issuing and honouring tokens when the merchant or its owner is no longer eligible", async () => {
    const c = await client();
    const token = await service.issueOAuthToken(c.client.clientId, c.clientSecret);

    await db.user.update({ where: { id: c.user.id }, data: { status: "SUSPENDED" } });
    expect(
      (await oauthError(service.authenticateOAuthToken(token.access_token))).code,
    ).toBe("invalid_client");
    expect(
      (await oauthError(service.issueOAuthToken(c.client.clientId, c.clientSecret))).code,
    ).toBe("invalid_client");

    await db.user.update({ where: { id: c.user.id }, data: { status: "ACTIVE" } });
    expect(
      (await service.issueOAuthToken(c.client.clientId, c.clientSecret)).token_type,
    ).toBe("Bearer");
    await db.merchant.update({
      where: { id: c.merchant.id },
      data: { status: "REJECTED" },
    });
    expect(
      (await oauthError(service.issueOAuthToken(c.client.clientId, c.clientSecret))).code,
    ).toBe("invalid_client");
  });

  it("refuses expired grants, missing grants and human tokens", async () => {
    const c = await client();
    const token = await service.issueOAuthToken(c.client.clientId, c.clientSecret);
    await db.accessGrant.updateMany({
      where: { clientId: c.client.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await oauthError(service.authenticateOAuthToken(token.access_token))).status,
    ).toBe(401);
    await db.accessGrant.deleteMany({});
    expect(
      (await oauthError(service.authenticateOAuthToken(token.access_token))).status,
    ).toBe(401);
    const human = (await tokens.issue(c.user.id, "MERCHANT")).accessToken;
    await expect(service.authenticateOAuthToken(human)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("refuses a token whose scopes exceed what the client now holds", async () => {
    const c = await client(["orders:read", "orders:write"]);
    const token = await service.issueOAuthToken(c.client.clientId, c.clientSecret);
    await db.merchantApiClient.update({
      where: { id: c.client.id },
      data: { scopes: ["orders:read"] },
    });
    expect(
      (await oauthError(service.authenticateOAuthToken(token.access_token))).code,
    ).toBe("invalid_client");
  });
});

describe("webhook settings", () => {
  it("reports unconfigured, then saves once showing the signing secret a single time", async () => {
    const { user, merchant } = await newMerchant();
    expect(await service.getWebhookSettings(user.id)).toMatchObject({
      configured: false,
      url: null,
    });
    const saved = await service.saveWebhookSettings(user.id, {
      url: "https://8.8.8.8/hook",
    });
    expect(saved.settings).toMatchObject({
      configured: true,
      url: "https://8.8.8.8/hook",
    });
    expect(saved.signingSecret).toMatch(/^sd_whsec_/);
    const row = await db.merchantWebhookConfig.findUniqueOrThrow({
      where: { merchantId: merchant.id },
    });
    expect(row.encryptedSecret.startsWith("v1.")).toBe(true);
    expect(row.encryptedSecret).not.toContain(saved.signingSecret!);

    const changed = await service.saveWebhookSettings(user.id, {
      url: "https://8.8.4.4/other",
    });
    expect(changed.signingSecret).toBeNull();
    expect(changed.settings.url).toBe("https://8.8.4.4/other");
    expect(await service.webhookTargetForDelivery(merchant.id)).toEqual({
      url: "https://8.8.4.4/other",
      secret: saved.signingSecret,
    });
  });

  it("refuses unsafe destinations and unknown fields", async () => {
    const { user } = await newMerchant();
    for (const url of [
      "http://8.8.8.8/hook",
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.0.0.5/hook",
      "https://169.254.169.254/latest",
      "https://user:pw@8.8.8.8/hook",
    ])
      expect((await httpError(service.saveWebhookSettings(user.id, { url }))).status).toBe(
        422,
      );
    await expect(
      service.saveWebhookSettings(user.id, { url: "https://8.8.8.8/h", secret: "mine" }),
    ).rejects.toThrow();
    expect((await service.getWebhookSettings(user.id)).configured).toBe(false);
  });

  it("rotates the secret, which only the new value then signs with", async () => {
    const { user, merchant } = await newMerchant();
    expect(
      (await httpError(service.rotateWebhookSecret(user.id))).code,
    ).toBe("WEBHOOK_NOT_CONFIGURED");
    const saved = await service.saveWebhookSettings(user.id, { url: "https://8.8.8.8/h" });
    const rotated = await service.rotateWebhookSecret(user.id);
    expect(rotated.signingSecret).not.toBe(saved.signingSecret);
    expect(await service.webhookTargetForDelivery(merchant.id)).toMatchObject({
      secret: rotated.signingSecret,
    });
  });

  it("yields no delivery target unless the merchant is approved and its owner active", async () => {
    const { user, merchant } = await newMerchant();
    await service.saveWebhookSettings(user.id, { url: "https://8.8.8.8/h" });
    expect(await service.webhookTargetForDelivery(merchant.id)).not.toBeNull();
    expect(
      await service.webhookTargetForDelivery("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();

    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    expect(await service.webhookTargetForDelivery(merchant.id)).toBeNull();
    expect(
      (await httpError(service.saveWebhookSettings(user.id, { url: "https://8.8.8.8/x" })))
        .code,
    ).toBe("MERCHANT_NOT_APPROVED");
    expect((await httpError(service.rotateWebhookSecret(user.id))).code).toBe(
      "MERCHANT_NOT_APPROVED",
    );
    await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    await db.merchant.update({ where: { id: merchant.id }, data: { status: "REJECTED" } });
    expect(await service.webhookTargetForDelivery(merchant.id)).toBeNull();
  });
});

describe("merchant order list", () => {
  async function order(merchantId: string, ownerId: number, status: "CREATED" | "DELIVERED") {
    const n = ++counter;
    const origin = await db.zone.create({ data: { district: `Colombo${n}`, town: "Colombo" } });
    const destination = await db.zone.create({ data: { district: `Kandy${n}`, town: "Kandy" } });
    const price = await db.priceVersion.create({
      data: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        baseCents: 45000,
        perExtraKgCents: 12000,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      },
    });
    const quote = await db.quote.create({
      data: {
        userId: ownerId,
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        priceVersionId: price.id,
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
        trackingNumber: `SD-M${String(n).padStart(7, "0")}-X`,
        userId: ownerId,
        merchantId,
        quoteId: quote.id,
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        feeCents: 45000,
        status,
        recipientName: "Recipient",
        recipientPhone: "+94771234567",
        recipientAddress: "1 Test Road",
      },
    });
  }

  it("returns only the caller's own orders, optionally filtered by status", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    const a = await order(mine.merchant.id, mine.user.id, "CREATED");
    const b = await order(mine.merchant.id, mine.user.id, "DELIVERED");
    await order(theirs.merchant.id, theirs.user.id, "CREATED");

    const all = await service.listOrders(mine.user.id);
    expect(all.items.map((o) => o.trackingNumber).sort()).toEqual(
      [a.trackingNumber, b.trackingNumber].sort(),
    );
    const delivered = await service.listOrders(mine.user.id, "DELIVERED");
    expect(delivered.items.map((o) => o.trackingNumber)).toEqual([b.trackingNumber]);
    expect(delivered.items[0]).toMatchObject({
      feeCents: 45000,
      recipientName: "Recipient",
    });
    expect(JSON.stringify(all)).not.toContain("1 Test Road");
    expect((await service.listOrders(theirs.user.id)).items).toHaveLength(1);
  });
});
