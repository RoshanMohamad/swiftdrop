import { isValidTrackingNumber } from "@swiftdrop/contracts";
import { totpAt } from "../src/modules/auth/totp.js";
import { cleanupAuth } from "../src/modules/auth/index.js";
import {
  beforeAll,
  afterAll,
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
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { Redis } from "ioredis";
import pino from "pino";
import { createDatabase, type Database, RoleName } from "@swiftdrop/db";
import { isSwiftDropEvent, ROUTING_KEYS } from "@swiftdrop/contracts";
import { createApp } from "../src/app.js";
import { createInternalApp } from "../src/internal-app.js";
import { signServiceEventToken } from "../src/modules/services/signing.js";
import { createTokenService } from "../src/modules/auth/jwt.js";
import { tokenHash } from "../src/modules/auth/service.js";
import type { GoogleOidc } from "../src/modules/auth/google.js";
import type { Config } from "../src/shared/config.js";
const root = resolve(import.meta.dirname, "../../..");
const runPnpm = (
  args: string[],
  options: Parameters<typeof execFileSync>[2],
) =>
  process.platform === "win32"
    ? execFileSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `pnpm.cmd ${args.join(" ")}`],
        options,
      )
    : execFileSync("pnpm", args, options);
const password = "Integration test passphrase!";
const input = {
  email: "customer@example.test",
  fullName: "Example Customer",
  phone: "+94771234567",
  password,
};
let postgres: StartedTestContainer;
let redisContainer: StartedTestContainer;
let db: Database;
let redis: Redis;
let api: ReturnType<typeof createApp>;
let config: Config;
let hash: string;
let verificationLink = "";
let invitationLink = "";
let resetLinks: string[] = [];
let mailFailure = false;
let googleIdentityEmail = "google@example.test";
async function user(role: RoleName = "CUSTOMER", email = input.email) {
  return db.user.create({
    data: {
      email,
      fullName: input.fullName,
      phone: input.phone,
      passwordHash: hash,
      roleId: role,
    },
  });
}
type Agent = ReturnType<typeof request.agent>;
async function post(agent: Agent, path: string, body: object = {}) {
  const context = await agent.get("/api/v1/auth/csrf").expect(200);
  return agent
    .post(`/api/v1/auth/${path}`)
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", context.body.csrfToken)
    .send(body);
}
beforeAll(async () => {
  postgres = await new GenericContainer("postgres:17-alpine")
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "auth_test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  redisContainer = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();
  const databaseURL = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/auth_test`;
  runPnpm(
    ["--filter", "@swiftdrop/db", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseURL },
      stdio: "pipe",
    },
  );
  try {
    runPnpm(
      [
        "--filter",
        "@swiftdrop/db",
        "exec",
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ],
      {
        cwd: root,
        env: { ...process.env, DATABASE_URL: databaseURL },
        stdio: "pipe",
      },
    );
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`,
      { cause: error },
    );
  }
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
    HOST: "127.0.0.1",
    INTERNAL_HOST: "127.0.0.1",
    TRUST_PROXY: 0,
    APP_ORIGIN: "http://localhost:5173",
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
    AUTH_KEY_ID: "test-1",
    AUTH_PRIVATE_KEY_FILE: "",
    AUTH_PUBLIC_KEYS_FILE: "",
    CSRF_SECRET_FILE: "",
    RATE_LIMIT_SECRET_FILE: "",
    OAUTH_TRANSACTION_SECRET_FILE: "",
    MFA_SECRET_FILE: "",
    MFA_KEY_VERSION: 1,
    MFA_REQUIRED_ROLES: [],
    RECENT_AUTH_SECONDS: 300,
    AUDIT_RETENTION_DAYS: 365,
    oauthSecret: "c".repeat(64),
    mfaSecret: "d".repeat(64),
    COOKIE_SECURE: "false",
    secure: false,
    root,
    privateKey: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeys: {
      "test-1": pair.publicKey
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
    mailer: {
      sendVerification: async (_email, url) => {
        if (mailFailure) throw new Error("smtp unavailable");
        verificationLink = url;
      },
      sendInvitation: async (_email, url) => {
        if (mailFailure) throw new Error("smtp unavailable");
        invitationLink = url;
      },
      sendPasswordReset: async (_email, url) => {
        if (mailFailure) throw new Error("smtp unavailable");
        resetLinks.push(url);
      },
    },
    google: {
      enabled: () => true,
      authorizationUrl: async (state: string) =>
        `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
      exchange: async () => ({
        sub: "google-subject-1",
        email: googleIdentityEmail,
        fullName: "Google Customer",
      }),
    } as unknown as GoogleOidc,
  });
  hash = await bcrypt.hash(password, 12);
  for (const role of Object.values(RoleName))
    await db.role.upsert({
      where: { id: role },
      update: {},
      create: { id: role },
    });
}, 240000);
beforeEach(async () => {
  await db.$executeRaw`TRUNCATE users CASCADE`;
  await db.$executeRaw`TRUNCATE outbox_events, consumer_progress, idempotency_records, service_principals, webhook_deliveries, auth_audit_events CASCADE`;
  await redis.flushdb();
  verificationLink = "";
  invitationLink = "";
  resetLinks = [];
  mailFailure = false;
  googleIdentityEmail = "google@example.test";
});
afterAll(async () => {
  await db?.$disconnect();
  redis?.disconnect();
  await redisContainer?.stop();
  await postgres?.stop();
}, 60000);
describe("customer HTTP boundary", () => {
  it("enforces live service-key revocation across separate internal API instances", async () => {
    const serviceId = "notification-svc";
    const serviceKind = "notification";
    const audience = "swiftdrop-notification-worker";
    const signingPair = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const privateKey = signingPair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const publicKeyPem = signingPair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const keyId = `notification-${randomUUID()}`;
    const eventId = randomUUID();
    const parcelId = randomUUID();
    await db.servicePrincipal.create({
      data: {
        serviceId,
        serviceKind,
        audience,
        permissions: ["notifications:lookup"],
      },
    });
    await db.servicePublicKey.create({
      data: { keyId, serviceId, publicKeyPem, notBefore: new Date() },
    });
    await db.outboxEvent.create({
      data: {
        eventId,
        eventType: "parcel.created",
        aggregateId: parcelId,
        payload: {
          eventId,
          type: "parcel.created",
          version: 1,
          occurredAt: "2026-11-13T10:30:00.000Z",
          sequence: 1,
          data: {
            parcelId,
            trackingNo: "SD1234567A",
            customerId: "1",
            originZone: "Colombo",
            destZone: "Kandy",
            feeCents: 1500,
            scheduledDate: "2026-11-13T10:30:00.000Z",
          },
        },
      },
    });
    const token = await signServiceEventToken({
      privateKey,
      keyId,
      serviceId,
      serviceKind,
      issuer: config.SERVICE_ISSUER,
      audience,
      scope: "notifications:lookup",
      eventId,
      parcelId,
    });
    const first = createInternalApp({
      db,
      config,
      logger: pino({ enabled: false }),
    });
    const second = createInternalApp({
      db,
      config,
      logger: pino({ enabled: false }),
    });
    await request(api.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    await request(first)
      .get(`/internal/v1/notifications/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await db.servicePrincipal.update({
      where: { serviceId },
      data: { revokedAt: new Date() },
    });
    await request(second)
      .get(`/internal/v1/notifications/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("invites a dispatcher, activates only on explicit acceptance, and then allows ordinary login", async () => {
    const admin = await user("ADMIN", "admin@example.test");
    const agent = request.agent(api.app);
    const logged = await post(agent, "login", { email: admin.email, password });
    const csrf = await agent.get("/api/v1/auth/csrf").expect(200);
    const created = await agent
      .post("/api/v1/admin/users")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .set("Authorization", `Bearer ${logged.body.accessToken}`)
      .send({
        fullName: "Dispatch Staff",
        email: "dispatch@example.test",
        phone: "0771234567",
        role: "DISPATCHER",
      })
      .expect(201);
    expect(created.body.user).toMatchObject({
      role: "DISPATCHER",
      status: "INVITED",
      email: "dispatch@example.test",
    });
    expect(created.body.user.passwordHash).toBeUndefined();
    expect(created.body.delivery).toBe("sent");
    const invited = await db.user.findUniqueOrThrow({
      where: { email: "dispatch@example.test" },
    });
    expect(invited.passwordHash).toBeNull();
    expect(invited.emailVerifiedAt).toBeNull();
    expect(invitationLink).toContain("/auth/accept-invite#token=");
    const rawToken = new URL(invitationLink).hash.slice("#token=".length);
    expect(
      (
        await db.staffInvitation.findFirstOrThrow({
          where: { userId: invited.id },
        })
      ).tokenHash,
    ).not.toBe(rawToken);
    expect(
      (await post(agent, "accept-invite", { token: rawToken, password }))
        .status,
    ).toBe(200);
    const active = await db.user.findUniqueOrThrow({
      where: { id: invited.id },
    });
    expect(active).toMatchObject({ status: "ACTIVE", roleId: "DISPATCHER" });
    expect(active.emailVerifiedAt).toBeInstanceOf(Date);
    expect(bcrypt.getRounds(active.passwordHash!)).toBe(12);
    expect(
      (await post(agent, "accept-invite", { token: rawToken, password }))
        .status,
    ).toBe(400);
    expect(
      (await post(agent, "login", { email: invited.email, password })).status,
    ).toBe(200);
  });

  it("activates a courier invitation together with an off-duty capacity profile", async () => {
    const admin = await user("ADMIN", "admin@example.test");
    const agent = request.agent(api.app);
    const logged = await post(agent, "login", { email: admin.email, password });
    const csrf = await agent.get("/api/v1/auth/csrf").expect(200);
    await agent
      .post("/api/v1/admin/users")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .set("Authorization", `Bearer ${logged.body.accessToken}`)
      .send({
        fullName: "Courier Staff",
        email: "courier@example.test",
        phone: "0771234567",
        role: "COURIER",
      })
      .expect(201);
    const courier = await db.user.findUniqueOrThrow({
      where: { email: "courier@example.test" },
    });
    expect(await db.courierProfile.count()).toBe(0);
    const rawToken = new URL(invitationLink).hash.slice("#token=".length);
    expect(
      (await post(agent, "accept-invite", { token: rawToken, password }))
        .status,
    ).toBeLessThan(300);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: courier.id } })).status,
    ).toBe("ACTIVE");
    expect(
      await db.courierProfile.findUniqueOrThrow({
        where: { userId: courier.id },
      }),
    ).toMatchObject({ onDuty: false, capacity: 10, workload: 0 });
  });

  it("filters staff and rotates/revokes invitations while retaining mail-failed accounts", async () => {
    const admin = await user("ADMIN", "admin@example.test");
    const agent = request.agent(api.app);
    const logged = await post(agent, "login", { email: admin.email, password });
    async function adminPost(path: string, body: object) {
      const csrf = await agent.get("/api/v1/auth/csrf").expect(200);
      return agent
        .post(path)
        .set("Origin", config.APP_ORIGIN)
        .set("X-CSRF-Token", csrf.body.csrfToken)
        .set("Authorization", `Bearer ${logged.body.accessToken}`)
        .send(body);
    }
    mailFailure = true;
    const failedMail = await adminPost("/api/v1/admin/users", {
      fullName: "No Mail Staff",
      email: "nomail@example.test",
      phone: "0771234567",
      role: "DISPATCHER",
    });
    expect(failedMail.status).toBe(201);
    expect(failedMail.body.delivery).toBe("failed");
    expect(
      (
        await db.user.findUniqueOrThrow({
          where: { email: "nomail@example.test" },
        })
      ).status,
    ).toBe("INVITED");
    mailFailure = false;
    expect(
      (
        await adminPost("/api/v1/admin/users", {
          fullName: "Rotate Staff",
          email: "rotate@example.test",
          phone: "0771234567",
          role: "DISPATCHER",
        })
      ).status,
    ).toBe(201);
    const rotating = await db.user.findUniqueOrThrow({
      where: { email: "rotate@example.test" },
    });
    const oldToken = new URL(invitationLink).hash.slice("#token=".length);
    const listing = await agent
      .get("/api/v1/admin/users?role=DISPATCHER&status=INVITED")
      .set("Authorization", `Bearer ${logged.body.accessToken}`)
      .expect(200);
    expect(
      listing.body.items.map((item: { email: string }) => item.email),
    ).toEqual(
      expect.arrayContaining(["nomail@example.test", "rotate@example.test"]),
    );
    expect(listing.body.items[0].passwordHash).toBeUndefined();
    await db.staffInvitation.updateMany({
      where: { userId: rotating.id },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    expect(
      (
        await adminPost(`/api/v1/admin/users/${rotating.id}/invitation`, {
          action: "resend",
        })
      ).status,
    ).toBe(200);
    const newToken = new URL(invitationLink).hash.slice("#token=".length);
    expect(newToken).not.toBe(oldToken);
    expect(
      (await post(agent, "accept-invite", { token: oldToken, password }))
        .status,
    ).toBe(400);
    expect(
      (
        await adminPost(`/api/v1/admin/users/${rotating.id}/invitation`, {
          action: "revoke",
        })
      ).status,
    ).toBe(200);
    expect(
      (await post(agent, "accept-invite", { token: newToken, password }))
        .status,
    ).toBe(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: rotating.id } })).status,
    ).toBe("INVITED");
  });

  it("registers an active customer with bcrypt-12 and returns a safe canonical profile", async () => {
    const agent = request.agent(api.app);
    const created = await post(agent, "register", {
      ...input,
      email: " Customer@Example.TEST ",
    });
    expect(created.status).toBe(202);
    const account = await db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    expect(account).toMatchObject({ status: "ACTIVE", roleId: "CUSTOMER" });
    expect(bcrypt.getRounds(account.passwordHash!)).toBe(12);
    expect(await bcrypt.compare(password, account.passwordHash!)).toBe(true);
    const logged = await post(agent, "login", { email: input.email, password });
    expect(logged.status).toBe(200);
    expect(logged.headers["cache-control"]).toBe("no-store");
    expect(String(logged.headers["set-cookie"])).toMatch(/HttpOnly/);
    expect(String(logged.headers["set-cookie"])).toMatch(/SameSite=Strict/);
    expect(logged.body.refreshToken).toBeUndefined();
    const me = await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${logged.body.accessToken}`)
      .expect(200);
    expect(Object.keys(me.body).sort()).toEqual([
      "email",
      "emailVerified",
      "fullName",
      "id",
      "phone",
      "profileComplete",
      "role",
      "status",
    ]);
    await agent.get("/api/v1/auth/me").expect(401);
    expect(await db.refreshToken.count()).toBe(1);
  });
  it("sends a hashed single-use verification link and confirms only on explicit POST", async () => {
    const agent = request.agent(api.app);
    expect((await post(agent, "register", input)).status).toBe(202);
    const account = await db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    expect(account.emailVerifiedAt).toBeNull();
    const raw = new URL(verificationLink).hash.slice("#token=".length);
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      await db.verificationToken.findUnique({
        where: { tokenHash: tokenHash(raw) },
      }),
    ).toMatchObject({ userId: account.id, consumedAt: null });
    const login = await post(agent, "login", { email: input.email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(false);
    expect((await post(agent, "verify-email", { token: raw })).status).toBe(
      200,
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: account.id } }))
        .emailVerifiedAt,
    ).toBeInstanceOf(Date);
    expect((await post(agent, "verify-email", { token: raw })).status).toBe(
      400,
    );
    expect(
      await db.verificationToken.findFirst({
        where: { tokenHash: tokenHash(raw) },
      }),
    ).toMatchObject({ consumedAt: expect.any(Date) });
  });
  it("resend revokes the prior link and expired links remain unusable", async () => {
    const agent = request.agent(api.app);
    await post(agent, "register", input);
    const previous = new URL(verificationLink).hash.slice("#token=".length);
    await db.verificationToken.update({
      where: { tokenHash: tokenHash(previous) },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const response = await post(agent, "resend-verification", {
      email: input.email,
    });
    expect(response.status).toBe(202);
    const current = new URL(verificationLink).hash.slice("#token=".length);
    expect(current).not.toBe(previous);
    expect(
      (await post(agent, "verify-email", { token: previous })).status,
    ).toBe(400);
    await db.verificationToken.update({
      where: { tokenHash: tokenHash(current) },
      data: {
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect((await post(agent, "verify-email", { token: current })).status).toBe(
      400,
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { email: input.email } }))
        .emailVerifiedAt,
    ).toBeNull();
  });
  it("keeps registration usable when local mail delivery fails", async () => {
    mailFailure = true;
    const response = await post(request.agent(api.app), "register", input);
    expect(response.status).toBe(202);
    expect(await db.user.count()).toBe(1);
    expect(await db.verificationToken.count()).toBe(1);
  });
  it("serializes concurrent confirmation attempts to one state change", async () => {
    const first = request.agent(api.app);
    await post(first, "register", input);
    const raw = new URL(verificationLink).hash.slice("#token=".length);
    const results = await Promise.all([
      post(first, "verify-email", { token: raw }),
      post(request.agent(api.app), "verify-email", { token: raw }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    expect(
      await db.user.count({ where: { emailVerifiedAt: { not: null } } }),
    ).toBe(1);
  });
  it("creates a restricted Google customer and completes the profile before account use", async () => {
    const agent = request.agent(api.app);
    const started = await agent.get("/api/v1/auth/google");
    expect(started.status).toBe(302);
    const state = new URL(started.headers.location).searchParams.get("state")!;
    const callback = await agent.get(
      `/api/v1/auth/google/callback?state=${state}&code=code`,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(
      `${config.APP_ORIGIN}/auth/google/result?status=success`,
    );
    const restored = await post(agent, "refresh", {});
    expect(restored.body.user).toMatchObject({
      email: googleIdentityEmail,
      fullName: "Google Customer",
      phone: null,
      profileComplete: false,
    });
    await request(api.app)
      .get("/api/v1/parcels")
      .set("Authorization", `Bearer ${restored.body.accessToken}`)
      .expect(403);
    const csrf = await agent.get("/api/v1/auth/csrf");
    const completed = await agent
      .post("/api/v1/auth/complete-profile")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .set("Authorization", `Bearer ${restored.body.accessToken}`)
      .send({ fullName: "Google Customer", phone: "0771234567" });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      phone: "+94771234567",
      profileComplete: true,
    });
    const account = await db.user.findUniqueOrThrow({
      where: { email: googleIdentityEmail },
    });
    expect(account).toMatchObject({
      roleId: "CUSTOMER",
      passwordHash: null,
      googleSub: "google-subject-1",
    });
  });
  it("links Google only after fresh password proof and preserves the customer account", async () => {
    const original = await user();
    googleIdentityEmail = input.email;
    const agent = request.agent(api.app);
    const login = await post(agent, "login", { email: input.email, password });
    const csrf = await agent.get("/api/v1/auth/csrf");
    const started = await agent
      .post("/api/v1/auth/google/link")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ password });
    expect(started.status).toBe(200);
    const state = new URL(started.body.authorizationUrl).searchParams.get(
      "state",
    )!;
    const callback = await agent.get(
      `/api/v1/auth/google/callback?state=${state}&code=code`,
    );
    expect(callback.headers.location).toBe(
      `${config.APP_ORIGIN}/auth/google/result?status=linked`,
    );
    const linked = await db.user.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(linked).toMatchObject({
      roleId: "CUSTOMER",
      passwordHash: original.passwordHash,
      googleSub: "google-subject-1",
    });
  });
  it("rejects mass assignment and unsafe bodies before creating accounts", async () => {
    const agent = request.agent(api.app);
    expect(
      (await post(agent, "register", { ...input, role: "ADMIN" })).status,
    ).toBe(400);
    expect(
      (await post(agent, "register", { ...input, password: "😀".repeat(19) }))
        .status,
    ).toBe(400);
    const context = await agent.get("/api/v1/auth/csrf");
    await agent
      .post("/api/v1/auth/register")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", context.body.csrfToken)
      .send({ ...input, fullName: "x".repeat(9000) })
      .expect(413);
    expect(await db.user.count()).toBe(0);
  });
  it("rejects missing, cross-origin and invalid CSRF before any signup", async () => {
    const agent = request.agent(api.app);
    await agent.post("/api/v1/auth/register").send(input).expect(403);
    const context = await agent.get("/api/v1/auth/csrf");
    await agent
      .post("/api/v1/auth/register")
      .set("Origin", "https://evil.test")
      .set("X-CSRF-Token", context.body.csrfToken)
      .send(input)
      .expect(403);
    await agent
      .post("/api/v1/auth/register")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", "wrong")
      .send(input)
      .expect(403);
    await agent
      .post("/api/v1/auth/register")
      .set("Origin", config.APP_ORIGIN)
      .type("form")
      .send(input)
      .expect(415);
    expect(await db.user.count()).toBe(0);
  });
  it("handles duplicate/concurrent canonical emails without replacing credentials", async () => {
    const results = await Promise.all([
      api.service.register(input),
      api.service.register({ ...input, fullName: "Overwrite attempt" }),
    ]);
    expect(results).toHaveLength(2);
    expect(await db.user.count()).toBe(1);
    const existing = await db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    const response = await post(request.agent(api.app), "register", {
      ...input,
      password: "a different passphrase!",
    });
    expect(response.status).toBe(202);
    expect(
      (await db.user.findUniqueOrThrow({ where: { email: input.email } }))
        .passwordHash,
    ).toBe(existing.passwordHash);
  });
  it("gives identical failures for unknown, suspended and passwordless users", async () => {
    const account = await user();
    const unknown = await post(request.agent(api.app), "login", {
      email: "missing@example.test",
      password,
    });
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    const suspended = await post(request.agent(api.app), "login", {
      email: input.email,
      password,
    });
    await db.user.update({
      where: { id: account.id },
      data: { status: "ACTIVE", passwordHash: null },
    });
    const passwordless = await post(request.agent(api.app), "login", {
      email: input.email,
      password,
    });
    expect([unknown.status, suspended.status, passwordless.status]).toEqual([
      401, 401, 401,
    ]);
    expect(
      new Set([
        unknown.body.detail,
        suspended.body.detail,
        passwordless.body.detail,
      ]).size,
    ).toBe(1);
  });
  it("throttles failed accounts and does not trust spoofed forwarded IPs", async () => {
    const agent = request.agent(api.app);
    for (let i = 0; i < 5; i++)
      expect(
        (await post(agent, "login", { email: input.email, password })).status,
      ).toBe(401);
    expect(
      (await post(agent, "login", { email: input.email, password })).status,
    ).toBe(429);
    const context = await agent.get("/api/v1/auth/csrf");
    for (let i = 0; i < 6; i++) {
      const response = await agent
        .post("/api/v1/auth/register")
        .set("Origin", config.APP_ORIGIN)
        .set("X-CSRF-Token", context.body.csrfToken)
        .set("X-Forwarded-For", `192.0.2.${i}`)
        .send({ ...input, role: "ADMIN" });
      expect(response.status).toBe(i < 5 ? 400 : 429);
    }
  });
});
describe("grant and refresh lifecycle", () => {
  it("retains consumed hashes until absolute expiry and cleans expired families", async () => {
    await user();
    const original = await api.service.login(input.email, password);
    await api.service.refresh(original.refreshToken);
    await db.accessGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await cleanupAuth(db)).toEqual({
      grants: 2,
      families: 0,
      verificationTokens: 0,
      oauthTransactions: 0,
      staffInvitations: 0,
      resetTokens: 0,
      mfaChallenges: 0,
      auditEvents: 0,
    });
    expect(await db.refreshToken.count()).toBe(2);
    await db.authSession.updateMany({
      data: {
        idleExpiresAt: new Date(Date.now() - 2000),
        absoluteExpiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(await cleanupAuth(db)).toEqual({
      grants: 0,
      families: 1,
      verificationTokens: 0,
      oauthTransactions: 0,
      staffInvitations: 0,
      resetTokens: 0,
      mfaChallenges: 0,
      auditEvents: 0,
    });
    expect(await db.refreshToken.count()).toBe(0);
    expect(await db.authSession.count()).toBe(0);
  });

  it.each(Object.values(RoleName))(
    "logs in role %s using current server role",
    async (role) => {
      await user(role);
      const session = await api.service.login(input.email, password);
      expect(
        (
          await api.service.authenticate(
            `Bearer ${session.response.accessToken}`,
          )
        ).user.role,
      ).toBe(role);
    },
  );
  it("rotates once, then commits whole-family revocation on reuse", async () => {
    await user();
    const original = await api.service.login(input.email, password);
    const next = await api.service.refresh(original.refreshToken);
    expect(next.refreshToken).not.toBe(original.refreshToken);
    expect(
      await db.refreshToken.count({ where: { consumedAt: { not: null } } }),
    ).toBe(1);
    expect(
      await db.refreshToken.findUnique({
        where: { tokenHash: tokenHash(original.refreshToken) },
      }),
    ).not.toBeNull();
    await expect(
      api.service.refresh(original.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      api.service.authenticate(`Bearer ${next.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    await expect(api.service.refresh(next.refreshToken)).rejects.toMatchObject({
      status: 401,
    });
    expect(await db.accessGrant.count()).toBe(0);
    expect((await db.authSession.findFirstOrThrow()).revocationReason).toBe(
      "refresh_reuse",
    );
  });
  it("serialises simultaneous identical refreshes and revokes the successful successor", async () => {
    await user();
    const original = await api.service.login(input.email, password);
    const results = await Promise.allSettled([
      api.service.refresh(original.refreshToken),
      api.service.refresh(original.refreshToken),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await db.accessGrant.count()).toBe(0);
    expect(await db.refreshToken.count()).toBe(2);
  });
  it("rejects invalid/unknown refresh values without creating state", async () => {
    await expect(api.service.refresh(undefined)).rejects.toMatchObject({
      status: 401,
    });
    await expect(api.service.refresh("x".repeat(43))).rejects.toMatchObject({
      status: 401,
    });
    expect(await db.authSession.count()).toBe(0);
  });
  it.each(["idleExpiresAt", "absoluteExpiresAt"] as const)(
    "enforces %s",
    async (field) => {
      await user();
      const original = await api.service.login(input.email, password);
      await db.authSession.updateMany({
        data: {
          [field]: new Date(Date.now() - 1000),
          ...(field === "absoluteExpiresAt"
            ? { idleExpiresAt: new Date(Date.now() - 2000) }
            : {}),
        },
      });
      await expect(
        api.service.refresh(original.refreshToken),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        api.service.authenticate(`Bearer ${original.response.accessToken}`),
      ).rejects.toMatchObject({ status: 401 });
    },
  );
  it("current status and stale role checks invalidate access and prevent resurrection", async () => {
    const account = await user();
    const session = await api.service.login(input.email, password);
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      api.service.authenticate(`Bearer ${session.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    await db.user.update({
      where: { id: account.id },
      data: { status: "ACTIVE" },
    });
    await expect(
      api.service.refresh(session.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
    const newer = await api.service.login(input.email, password);
    await db.user.update({
      where: { id: account.id },
      data: { roleId: "ADMIN" },
    });
    await expect(
      api.service.authenticate(`Bearer ${newer.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("serialises refresh behind a suspension transaction", async () => {
    const account = await user();
    const original = await api.service.login(input.email, password);
    let signal!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((done) => {
      signal = done;
    });
    const proceed = new Promise<void>((done) => {
      release = done;
    });
    const suspension = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${account.id} FOR UPDATE`;
      await tx.user.update({
        where: { id: account.id },
        data: { status: "SUSPENDED" },
      });
      signal();
      await proceed;
      await tx.authSession.updateMany({
        where: { userId: account.id },
        data: { revokedAt: new Date(), revocationReason: "suspension" },
      });
      await tx.accessGrant.deleteMany({
        where: { family: { userId: account.id } },
      });
    });
    await locked;
    const refresh = api.service.refresh(original.refreshToken);
    release();
    await suspension;
    await expect(refresh).rejects.toMatchObject({ status: 401 });
    expect(await db.accessGrant.count()).toBe(0);
  });
  it("logout revokes only its family; logout-all revokes every existing access grant", async () => {
    const account = await user();
    const first = await api.service.login(input.email, password);
    const second = await api.service.login(input.email, password);
    await api.service.logout(first.refreshToken);
    await api.service.logout(first.refreshToken);
    await api.service.logout(undefined);
    await expect(
      api.service.authenticate(`Bearer ${first.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      api.service.authenticate(`Bearer ${second.response.accessToken}`),
    ).resolves.toBeDefined();
    await api.service.revokeAll(account.id);
    await expect(
      api.service.authenticate(`Bearer ${second.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("renews CSRF after login and exercises HTTP refresh/logout", async () => {
    await user();
    const agent = request.agent(api.app);
    const login = await post(agent, "login", { email: input.email, password });
    expect(login.status).toBe(200);
    const refreshed = await post(agent, "refresh");
    expect(refreshed.status).toBe(200);
    expect((await post(agent, "logout")).status).toBe(204);
    await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(401);
    expect((await post(agent, "refresh")).status).toBe(401);
  });
  it("fails closed on Redis outage and a second API instance sees revocation", async () => {
    await user();
    const session = await api.service.login(input.email, password);
    const replica = createApp({
      db,
      redis,
      config,
      tokens: await createTokenService(config),
      logger: pino({ enabled: false }),
    });
    await replica.service.authenticate(
      `Bearer ${session.response.accessToken}`,
    );
    await api.service.logout(session.refreshToken);
    await expect(
      replica.service.authenticate(`Bearer ${session.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    const disconnected = new Redis({
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    disconnected.disconnect();
    const offline = createApp({
      db,
      redis: disconnected,
      config,
      tokens: await createTokenService(config),
      logger: pino({ enabled: false }),
    });
    await request(offline.app).get("/api/v1/auth/csrf").expect(503);
    await request(offline.app).get("/api/health").expect(200);
  });
});

describe("customer quote and booking workflow", () => {
  async function bookingSetup() {
    const customer = await user();
    const origin = await db.zone.upsert({
      where: { district: "Colombo" },
      update: { active: true },
      create: { district: "Colombo", town: "Colombo" },
    });
    const destination = await db.zone.upsert({
      where: { district: "Kandy" },
      update: { active: true },
      create: { district: "Kandy", town: "Kandy" },
    });
    await db.priceVersion.upsert({
      where: {
        originZoneId_destinationZoneId_effectiveFrom: {
          originZoneId: origin.id,
          destinationZoneId: destination.id,
          effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        },
      },
      update: { baseCents: 45000, perExtraKgCents: 12000 },
      create: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        baseCents: 45000,
        perExtraKgCents: 12000,
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    const session = await api.service.login(customer.email, password);
    const agent = request.agent(api.app);
    const csrf = await agent.get("/api/v1/auth/csrf").expect(200);
    const headers = {
      Origin: config.APP_ORIGIN,
      "X-CSRF-Token": csrf.body.csrfToken,
      Authorization: `Bearer ${session.response.accessToken}`,
    };
    return { customer, agent, headers };
  }

  it("quotes the versioned fee and atomically creates one private booking, history and safe outbox event", async () => {
    const { agent, headers } = await bookingSetup();
    const quote = await agent
      .post("/api/v1/quotes")
      .set(headers)
      .send({
        originDistrict: "Colombo",
        destinationDistrict: "Kandy",
        weightGrams: 2000,
        lengthMm: 250,
        widthMm: 180,
        heightMm: 120,
      })
      .expect(201);
    expect(quote.body).toMatchObject({
      feeCents: 57000,
      currency: "LKR",
      originTown: "Colombo",
      destinationTown: "Kandy",
    });
    expect(new Date(quote.body.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    const body = {
      quoteId: quote.body.id,
      recipientName: "Receiver Name",
      recipientPhone: "0771234567",
      recipientAddress: "12 Main Street, Kandy",
    };
    const key = "booking-key-00000001";
    const concurrent = await Promise.all([
      agent
        .post("/api/v1/parcels")
        .set({ ...headers, "Idempotency-Key": key })
        .send(body),
      agent
        .post("/api/v1/parcels")
        .set({ ...headers, "Idempotency-Key": key })
        .send(body),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
    const booked = concurrent[0]!;
    expect(concurrent[1]!.body).toEqual(booked.body);
    expect(booked.body).toMatchObject({
      status: "CREATED",
      feeCents: 57000,
      recipientPhone: "+94771234567",
    });
    expect(isValidTrackingNumber(booked.body.trackingNumber)).toBe(true);
    const replay = await agent
      .post("/api/v1/parcels")
      .set({ ...headers, "Idempotency-Key": key })
      .send(body)
      .expect(201);
    expect(replay.body).toEqual(booked.body);
    await agent
      .post("/api/v1/parcels")
      .set({ ...headers, "Idempotency-Key": key })
      .send({ ...body, recipientName: "Other Name" })
      .expect(409);
    await agent
      .post("/api/v1/parcels")
      .set({ ...headers, "Idempotency-Key": "booking-key-00000002" })
      .send(body)
      .expect(409);
    const contestedQuote = await agent
      .post("/api/v1/quotes")
      .set(headers)
      .send({
        originDistrict: "Colombo",
        destinationDistrict: "Kandy",
        weightGrams: 2000,
        lengthMm: 250,
        widthMm: 180,
        heightMm: 120,
      })
      .expect(201);
    const competing = await Promise.all([
      agent
        .post("/api/v1/parcels")
        .set({ ...headers, "Idempotency-Key": "booking-key-00000004" })
        .send({ ...body, quoteId: contestedQuote.body.id }),
      agent
        .post("/api/v1/parcels")
        .set({ ...headers, "Idempotency-Key": "booking-key-00000005" })
        .send({ ...body, quoteId: contestedQuote.body.id }),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await db.parcel.count()).toBe(2);
    expect(await db.parcelHistory.count()).toBe(2);
    const event = await db.outboxEvent.findFirstOrThrow();
    expect(event.eventType).toBe(ROUTING_KEYS.PARCEL_CREATED);
    expect(isSwiftDropEvent(event.payload)).toBe(true);
    // Envelope per Design Doc 6.3; eventId equals the outbox primary key.
    expect(event.id).toBe(event.eventId);
    expect(event.payload).toMatchObject({
      eventId: event.eventId,
      type: ROUTING_KEYS.PARCEL_CREATED,
      version: 1,
      sequence: 1,
      data: {
        parcelId: booked.body.id,
        trackingNo: booked.body.trackingNumber,
        to: "CREATED",
      },
    });
    expect(JSON.stringify(event.payload)).not.toContain("Receiver Name");
    expect(JSON.stringify(event.payload)).not.toContain("+94771234567");
    const publicPage = await agent
      .get(`/api/v1/track/${booked.body.trackingNumber}`)
      .expect(200);
    expect(Object.keys(publicPage.body).sort()).toEqual([
      "destinationTown",
      "history",
      "originTown",
      "status",
      "trackingNumber",
    ]);
    expect(JSON.stringify(publicPage.body)).not.toMatch(
      /Receiver Name|94771234567|Main Street|recipient/i,
    );
    await agent.get("/api/v1/track/not-valid").expect(400);
    await agent.get("/api/v1/admin/zones").set(headers).expect(403);
  });

  it("scopes private reads and rejects incomplete or suspended customer sessions", async () => {
    const { agent, headers, customer } = await bookingSetup();
    const quote = await agent
      .post("/api/v1/quotes")
      .set(headers)
      .send({
        originDistrict: "Colombo",
        destinationDistrict: "Kandy",
        weightGrams: 1000,
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
      })
      .expect(201);
    const booked = await agent
      .post("/api/v1/parcels")
      .set({ ...headers, "Idempotency-Key": "booking-key-00000003" })
      .send({
        quoteId: quote.body.id,
        recipientName: "Receiver Name",
        recipientPhone: "0771234567",
        recipientAddress: "12 Main Street, Kandy",
      })
      .expect(201);
    const stranger = await user("CUSTOMER", "stranger@example.test");
    const strangerSession = await api.service.login(stranger.email, password);
    await request(api.app)
      .get(`/api/v1/parcels/${booked.body.id}`)
      .set("Authorization", `Bearer ${strangerSession.response.accessToken}`)
      .expect(404);
    const suspendedSession = await api.service.login(customer.email, password);
    await db.user.update({
      where: { id: customer.id },
      data: { status: "SUSPENDED" },
    });
    await request(api.app)
      .get("/api/v1/parcels")
      .set("Authorization", `Bearer ${suspendedSession.response.accessToken}`)
      .expect(401);
  });
});

describe("webhook delivery log and replay (M08)", () => {
  async function adminSession(
    role: RoleName = "ADMIN",
    email = "admin@example.test",
  ) {
    const admin = await user(role, email);
    const agent = request.agent(api.app);
    const logged = await post(agent, "login", { email: admin.email, password });
    const csrf = await agent.get("/api/v1/auth/csrf").expect(200);
    const headers = {
      Origin: config.APP_ORIGIN,
      "X-CSRF-Token": csrf.body.csrfToken as string,
      Authorization: `Bearer ${logged.body.accessToken}`,
    };
    return { admin, agent, headers };
  }
  async function delivery(
    status: "FAILED" | "SUCCESS" | "PENDING",
    merchantId = "33333333-3333-4333-8333-333333333333",
  ) {
    const eventId = randomUUID();
    return db.webhookDelivery.create({
      data: {
        eventId,
        merchantId,
        eventType: "parcel.created",
        envelope: { eventId, type: "parcel.created" },
        status,
        attempts: {
          create: [0, 1].map((attempt) => ({
            runNumber: 0,
            attempt,
            state: "DONE" as const,
            leaseUntil: new Date(),
            outcome: "FAILURE" as const,
            statusCode: 500,
            errorCode: "HTTP_500",
            handoff: "RETRY" as const,
          })),
        },
      },
    });
  }

  it("lists deliveries newest first with filters and cursor pagination, without secrets or payloads", async () => {
    const { agent, headers } = await adminSession();
    const failed = await delivery("FAILED");
    await delivery("SUCCESS");
    await delivery("FAILED", "44444444-4444-4444-8444-444444444444");
    const all = await agent
      .get("/api/v1/admin/webhook-deliveries")
      .set(headers)
      .expect(200);
    expect(all.body.items).toHaveLength(3);
    expect(Object.keys(all.body.items[0]).sort()).toEqual([
      "createdAt",
      "currentRun",
      "eventId",
      "eventType",
      "id",
      "lastErrorCode",
      "merchantId",
      "status",
      "updatedAt",
    ]);
    const onlyFailed = await agent
      .get("/api/v1/admin/webhook-deliveries?status=FAILED&merchantId=33333333-3333-4333-8333-333333333333")
      .set(headers)
      .expect(200);
    expect(onlyFailed.body.items.map((i: { id: string }) => i.id)).toEqual([
      failed.id,
    ]);
    expect(onlyFailed.body.items[0].lastErrorCode).toBe("HTTP_500");
    const first = await agent
      .get("/api/v1/admin/webhook-deliveries?limit=2")
      .set(headers)
      .expect(200);
    expect(first.body.items).toHaveLength(2);
    const second = await agent
      .get(
        `/api/v1/admin/webhook-deliveries?limit=2&cursor=${first.body.nextCursor}`,
      )
      .set(headers)
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    await agent
      .get("/api/v1/admin/webhook-deliveries?cursor=garbage")
      .set(headers)
      .expect(400);
    await agent
      .get("/api/v1/admin/webhook-deliveries?status=NOPE")
      .set(headers)
      .expect(400);
  });

  it("shows attempt history and replays a failed delivery exactly once, routed only to webhooks", async () => {
    const { agent, headers, admin } = await adminSession();
    const failed = await delivery("FAILED");
    const detail = await agent
      .get(`/api/v1/admin/webhook-deliveries/${failed.id}`)
      .set(headers)
      .expect(200);
    expect(
      detail.body.attempts.map((a: { attempt: number }) => a.attempt),
    ).toEqual([0, 1]);
    expect(JSON.stringify(detail.body)).not.toMatch(/secret|url|envelope/i);
    await agent
      .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
      .set(headers)
      .send({ reason: "x" })
      .expect(400);
    const replay = await agent
      .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
      .set(headers)
      .send({ reason: "Merchant fixed their endpoint" })
      .expect(202);
    expect(replay.body).toEqual({
      deliveryId: failed.id,
      runNumber: 1,
      status: "PENDING",
    });
    const after = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(after).toMatchObject({
      status: "PENDING",
      currentRun: 1,
      eventId: failed.eventId,
    });
    const audit = await db.webhookReplay.findFirstOrThrow({
      where: { deliveryId: failed.id },
    });
    expect(audit).toMatchObject({
      runNumber: 1,
      requestedByUserId: admin.id,
      reason: "Merchant fixed their endpoint",
    });
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { eventType: "webhook.replay.requested" },
    });
    expect(event.payload).toMatchObject({
      type: "webhook.replay.requested",
      data: { deliveryId: failed.id, runNumber: 1 },
    });
    // The delivery is now PENDING, so a second click or admin gets 409 and no new run.
    await agent
      .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
      .set(headers)
      .send({ reason: "Second click" })
      .expect(409);
    expect(
      await db.webhookReplay.count({ where: { deliveryId: failed.id } }),
    ).toBe(1);
    expect(
      await db.outboxEvent.count({
        where: { eventType: "webhook.replay.requested" },
      }),
    ).toBe(1);
  });

  it("serialises simultaneous replays to one run", async () => {
    const { agent, headers } = await adminSession();
    const failed = await delivery("FAILED");
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        agent
          .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
          .set(headers)
          .send({ reason: "Concurrent replay" }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([202, 409, 409]);
    expect(await db.webhookReplay.count()).toBe(1);
  });

  it("only replays FAILED deliveries and treats unknown ids as not found", async () => {
    const { agent, headers } = await adminSession();
    for (const status of ["SUCCESS", "PENDING"] as const) {
      const row = await delivery(status);
      await agent
        .post(`/api/v1/admin/webhook-deliveries/${row.id}/replay`)
        .set(headers)
        .send({ reason: "Should be refused" })
        .expect(409);
    }
    await agent
      .post(`/api/v1/admin/webhook-deliveries/${randomUUID()}/replay`)
      .set(headers)
      .send({ reason: "Unknown delivery" })
      .expect(404);
    await agent
      .get("/api/v1/admin/webhook-deliveries/not-a-uuid")
      .set(headers)
      .expect(404);
    expect(
      await db.outboxEvent.count({
        where: { eventType: "webhook.replay.requested" },
      }),
    ).toBe(0);
  });

  it("denies Dispatcher, Customer, anonymous and cross-site replay (Admin only)", async () => {
    const failed = await delivery("FAILED");
    for (const [role, email] of [
      ["DISPATCHER", "dispatcher@example.test"],
      ["CUSTOMER", "someone@example.test"],
    ] as const) {
      const { agent, headers } = await adminSession(role, email);
      await agent
        .get("/api/v1/admin/webhook-deliveries")
        .set(headers)
        .expect(403);
      await agent
        .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
        .set(headers)
        .send({ reason: "Not allowed to do this" })
        .expect(403);
    }
    await request(api.app).get("/api/v1/admin/webhook-deliveries").expect(401);
    const { agent, headers } = await adminSession(
      "ADMIN",
      "second-admin@example.test",
    );
    await agent
      .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
      .set({ ...headers, Origin: "https://evil.example" })
      .send({ reason: "Cross site attempt" })
      .expect(403);
    await agent
      .post(`/api/v1/admin/webhook-deliveries/${failed.id}/replay`)
      .set({ ...headers, "X-CSRF-Token": "bad" })
      .send({ reason: "Bad csrf attempt" })
      .expect(403);
    expect(await db.webhookReplay.count()).toBe(0);
    expect(
      (await db.webhookDelivery.findUniqueOrThrow({ where: { id: failed.id } }))
        .status,
    ).toBe("FAILED");
  });
});

describe("M01 account administration", () => {
  async function operator(email = "operator@example.test") {
    const account = await user("ADMIN", email);
    const credentials = await api.service.login(account.email, password);
    const authenticated = await api.service.authenticate(
      `Bearer ${credentials.response.accessToken}`,
    );
    return {
      account,
      credentials,
      actor: {
        id: account.id,
        familyId: authenticated.familyId,
        jti: authenticated.jti,
      },
    };
  }
  async function patchStatus(
    token: string,
    id: number | string,
    body: object,
    options = { csrf: true, origin: config.APP_ORIGIN },
  ) {
    const agent = request.agent(api.app);
    const csrf = await agent.get("/api/v1/auth/csrf").expect(200);
    const pending = agent
      .patch(`/api/v1/admin/users/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .set("Origin", options.origin);
    if (options.csrf) pending.set("X-CSRF-Token", csrf.body.csrfToken);
    return pending.send(body);
  }

  it("lists every role, nullable Google profiles, bounded pages and safe fields", async () => {
    const admin = await operator();
    for (const role of [
      "CUSTOMER",
      "MERCHANT",
      "COURIER",
      "DISPATCHER",
    ] as const)
      await user(role, `${role.toLowerCase()}@example.test`);
    await db.user.create({
      data: {
        email: "incomplete@example.test",
        roleId: "CUSTOMER",
        googleSub: "incomplete",
        fullName: null,
        phone: null,
      },
    });
    const headers = {
      Authorization: `Bearer ${admin.credentials.response.accessToken}`,
    };
    const first = await request(api.app)
      .get("/api/v1/admin/users?limit=2")
      .set(headers)
      .expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await request(api.app)
      .get(`/api/v1/admin/users?limit=2&cursor=${first.body.nextCursor}`)
      .set(headers)
      .expect(200);
    expect(
      second.body.items.every(
        (item: { id: number }) => item.id > first.body.items[1].id,
      ),
    ).toBe(true);
    const all = await request(api.app)
      .get("/api/v1/admin/users")
      .set(headers)
      .expect(200);
    expect(
      new Set(all.body.items.map((item: { role: string }) => item.role)).size,
    ).toBe(5);
    expect(
      all.body.items.find(
        (item: { email: string }) => item.email === "incomplete@example.test",
      ),
    ).toMatchObject({ fullName: null, phone: null });
    expect(Object.keys(all.body.items[0]).sort()).toEqual([
      "createdAt",
      "email",
      "fullName",
      "id",
      "invitationExpiresAt",
      "phone",
      "role",
      "status",
    ]);
    expect(
      (
        await request(api.app)
          .get("/api/v1/admin/users?role=MERCHANT&status=ACTIVE")
          .set(headers)
      ).body.items,
    ).toHaveLength(1);
    for (const query of [
      "role=ROOT",
      "status=DELETED",
      "limit=101",
      "cursor=invalid",
      "unknown=1",
    ])
      await request(api.app)
        .get(`/api/v1/admin/users?${query}`)
        .set(headers)
        .expect(400);
    expect(all.headers["cache-control"]).toBe("no-store");
  });

  it("enforces the role matrix, CSRF, Origin, strict DTOs and IDs", async () => {
    const target = await user();
    await request(api.app).get("/api/v1/admin/users").expect(401);
    for (const role of [
      "CUSTOMER",
      "MERCHANT",
      "COURIER",
      "DISPATCHER",
    ] as const) {
      const actor = await user(
        role,
        `actor-${role}@example.test`.toLowerCase(),
      );
      const session = await api.service.login(actor.email, password);
      await request(api.app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${session.response.accessToken}`)
        .expect(403);
      expect(
        (
          await patchStatus(session.response.accessToken, target.id, {
            status: "SUSPENDED",
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (await patchStatus("invalid", target.id, { status: "SUSPENDED" })).status,
    ).toBe(401);
    const admin = await operator();
    const token = admin.credentials.response.accessToken;
    expect(
      (
        await patchStatus(
          token,
          target.id,
          { status: "SUSPENDED" },
          { csrf: false, origin: config.APP_ORIGIN },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await patchStatus(
          token,
          target.id,
          { status: "SUSPENDED" },
          { csrf: true, origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    for (const body of [
      { status: "INVITED" },
      { status: "ACTIVE", role: "ADMIN" },
      {},
    ])
      expect((await patchStatus(token, target.id, body)).status).toBe(400);
    for (const id of ["-1", "1.1", "1e1", "9007199254740992", "abc"])
      expect(
        (await patchStatus(token, id, { status: "SUSPENDED" })).status,
      ).toBe(400);
    expect(
      (await patchStatus(token, 2147483647, { status: "SUSPENDED" })).status,
    ).toBe(404);
  });

  it("atomically revokes all families/actions across instances and never resurrects credentials", async () => {
    const admin = await operator();
    const target = await user();
    const first = await api.service.login(target.email, password);
    const successor = await api.service.refresh(first.refreshToken);
    const other = await api.service.login(target.email, password);
    const now = new Date();
    const verification = await db.verificationToken.create({
      data: {
        userId: target.id,
        tokenHash: tokenHash("verification"),
        generation: 1,
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    const invitation = await db.staffInvitation.create({
      data: {
        userId: target.id,
        tokenHash: tokenHash("invitation"),
        generation: 1,
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    const oauth = await db.oAuthTransaction.create({
      data: {
        userId: target.id,
        familyId: (
          await api.service.authenticate(
            `Bearer ${successor.response.accessToken}`,
          )
        ).familyId,
        passwordHash: hash,
        intent: "link",
        stateHash: tokenHash("state"),
        browserHash: tokenHash("browser"),
        nonce: "nonce",
        encryptedVerifier: "encrypted",
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    const instance = createApp({
      db,
      redis,
      config,
      tokens: await createTokenService(config),
      logger: pino({ enabled: false }),
    });
    const result = await patchStatus(
      admin.credentials.response.accessToken,
      target.id,
      { status: "SUSPENDED" },
    );
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("SUSPENDED");
    const families = await db.authSession.findMany({
      where: { userId: target.id },
    });
    expect(families).toHaveLength(2);
    expect(
      families.every(
        (family) =>
          family.revokedAt && family.revocationReason === "suspension",
      ),
    ).toBe(true);
    expect(
      await db.accessGrant.count({ where: { family: { userId: target.id } } }),
    ).toBe(0);
    expect(
      await db.refreshToken.count({ where: { family: { userId: target.id } } }),
    ).toBe(3);
    expect(
      (
        await db.verificationToken.findUniqueOrThrow({
          where: { id: verification.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect(
      (
        await db.staffInvitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect(
      (await db.oAuthTransaction.findUniqueOrThrow({ where: { id: oauth.id } }))
        .consumedAt,
    ).not.toBeNull();
    await request(instance.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${other.response.accessToken}`)
      .expect(401);
    await expect(
      instance.service.refresh(successor.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      api.service.login(target.email, password),
    ).rejects.toMatchObject({ status: 401 });
    await patchStatus(admin.credentials.response.accessToken, target.id, {
      status: "ACTIVE",
    });
    await expect(api.service.refresh(other.refreshToken)).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(
      api.service.authenticate(`Bearer ${successor.response.accessToken}`),
    ).rejects.toMatchObject({ status: 401 });
    const fresh = await api.service.login(target.email, password);
    await api.users.changeStatus(admin.actor, target.id, "ACTIVE");
    await expect(
      api.service.authenticate(`Bearer ${fresh.response.accessToken}`),
    ).resolves.toBeDefined();
  });

  it("rejects invited activation and credentialless reactivation; supports Google-only accounts", async () => {
    const admin = await operator();
    const invited = await db.user.create({
      data: {
        email: "invited@example.test",
        fullName: "Invited Staff",
        phone: input.phone,
        roleId: "DISPATCHER",
        status: "INVITED",
      },
    });
    for (const status of ["ACTIVE", "SUSPENDED"] as const)
      await expect(
        api.users.changeStatus(admin.actor, invited.id, status),
      ).rejects.toMatchObject({ status: 409, code: "INVITATION_REQUIRED" });
    await db.user.update({
      where: { id: invited.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      api.users.changeStatus(admin.actor, invited.id, "ACTIVE"),
    ).rejects.toMatchObject({ code: "CREDENTIALS_REQUIRED" });
    await db.user.update({
      where: { id: invited.id },
      data: { googleSub: "staff-google-is-not-supported" },
    });
    await expect(
      api.users.changeStatus(admin.actor, invited.id, "ACTIVE"),
    ).rejects.toMatchObject({ code: "CREDENTIALS_REQUIRED" });
    const google = await db.user.create({
      data: {
        email: "googleonly@example.test",
        roleId: "CUSTOMER",
        googleSub: "googleonly",
        status: "SUSPENDED",
      },
    });
    await expect(
      api.users.changeStatus(admin.actor, google.id, "ACTIVE"),
    ).resolves.toMatchObject({ status: "ACTIVE", fullName: null, phone: null });
    expect(
      (
        await patchStatus(
          admin.credentials.response.accessToken,
          admin.account.id,
          { status: "SUSPENDED" },
        )
      ).body.code,
    ).toBe("SELF_SUSPENSION");
    expect(
      await db.user.count({ where: { roleId: "ADMIN", status: "ACTIVE" } }),
    ).toBe(1);
  });

  it("serializes competing admins and retains an active administrator", async () => {
    const first = await operator("first@example.test");
    const second = await operator("second@example.test");
    const results = await Promise.allSettled([
      api.users.changeStatus(first.actor, second.account.id, "SUSPENDED"),
      api.users.changeStatus(second.actor, first.account.id, "SUSPENDED"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await db.user.count({ where: { roleId: "ADMIN", status: "ACTIVE" } }),
    ).toBe(1);
  });

  it("denies a previously authenticated actor after logout, including invitation mutations", async () => {
    const admin = await operator();
    const target = await user();
    await api.service.revokeAll(admin.account.id);
    await expect(
      api.users.changeStatus(admin.actor, target.id, "SUSPENDED"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      api.users.create(admin.actor, { ...input, role: "DISPATCHER" }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      api.users.invitationAction(admin.actor, target.id, "revoke"),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: target.id } })).status,
    ).toBe("ACTIVE");
  });

  it.each(["logout", "suspension"])(
    "rejects an actor %s between middleware authentication and its write",
    async (kind) => {
      const admin = await operator();
      const otherAdmin =
        kind === "suspension"
          ? await operator("other-admin@example.test")
          : null;
      const target = await user();
      let signal!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((done) => {
        signal = done;
      });
      const proceed = new Promise<void>((done) => {
        release = done;
      });
      const original = api.service.authenticate.bind(api.service);
      const spy = jest
        .spyOn(api.service, "authenticate")
        .mockImplementation(async (header) => {
          const result = await original(header);
          if (result.user.id === admin.account.id) {
            signal();
            await proceed;
          }
          return result;
        });
      try {
        const pending = patchStatus(
          admin.credentials.response.accessToken,
          target.id,
          { status: "SUSPENDED" },
        );
        await reached;
        if (otherAdmin)
          await api.users.changeStatus(
            otherAdmin.actor,
            admin.account.id,
            "SUSPENDED",
          );
        else await api.service.revokeAll(admin.account.id);
        release();
        expect((await pending).status).toBe(401);
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: target.id } }))
            .status,
        ).toBe("ACTIVE");
      } finally {
        release();
        spy.mockRestore();
      }
    },
  );

  it.each(["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"] as const)(
    "suspends and reactivates a %s account",
    async (role) => {
      const admin = await operator();
      const target = await user(role, "target@example.test");
      expect(
        (await api.users.changeStatus(admin.actor, target.id, "SUSPENDED"))
          .status,
      ).toBe("SUSPENDED");
      const suspended = await db.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      await api.users.changeStatus(admin.actor, target.id, "SUSPENDED");
      expect(
        await db.user.findUniqueOrThrow({ where: { id: target.id } }),
      ).toEqual(suspended);
      expect(
        (await api.users.changeStatus(admin.actor, target.id, "ACTIVE")).status,
      ).toBe("ACTIVE");
    },
  );

  it("serializes invitation acceptance with suspension without bypassing the invited state", async () => {
    const admin = await operator();
    const invited = await api.users.create(admin.actor, {
      fullName: "Invited Staff",
      email: "pending@example.test",
      phone: input.phone,
      role: "DISPATCHER",
    });
    const token = new URL(invitationLink).hash.slice("#token=".length);
    const results = await Promise.allSettled([
      api.users.accept(token, password),
      api.users.changeStatus(admin.actor, invited.user.id, "SUSPENDED"),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const target = await db.user.findUniqueOrThrow({
      where: { id: invited.user.id },
    });
    expect(target.status).toBe(
      results[1].status === "fulfilled" ? "SUSPENDED" : "ACTIVE",
    );
    if (results[1].status === "rejected")
      expect(results[1].reason).toMatchObject({ code: "INVITATION_REQUIRED" });
    expect(await db.authSession.count({ where: { userId: target.id } })).toBe(
      0,
    );
  });

  it("cancels operator creation before work or rolls it back before commit", async () => {
    const { createAdmin } = await import("../src/modules/users/admin.js");
    const controller = new AbortController();
    controller.abort();
    await expect(
      createAdmin(db, input, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    const pending = new AbortController();
    const cancelling = db.$extends({
      query: {
        user: {
          async create({ args, query }) {
            const result = await query(args);
            pending.abort();
            return result;
          },
        },
      },
    });
    await expect(
      createAdmin(cancelling as Database, input, pending.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await db.user.count()).toBe(0);
  });

  it("serializes login and refresh racing suspension and leaves no usable target grant", async () => {
    const admin = await operator();
    const target = await user();
    const original = await api.service.login(target.email, password);
    const results = await Promise.allSettled([
      api.users.changeStatus(admin.actor, target.id, "SUSPENDED"),
      api.service.login(target.email, password),
      api.service.refresh(original.refreshToken),
    ]);
    expect(results[0].status).toBe("fulfilled");
    for (const result of results.slice(1)) {
      if (result.status === "fulfilled" && "response" in result.value) {
        await expect(
          api.service.authenticate(
            `Bearer ${result.value.response.accessToken}`,
          ),
        ).rejects.toMatchObject({ status: 401 });
      }
    }
    expect(
      await db.accessGrant.count({ where: { family: { userId: target.id } } }),
    ).toBe(0);
  });

  it("rolls back status, sessions and actions if any revocation write fails", async () => {
    const admin = await operator();
    const target = await user();
    const original = await api.service.login(target.email, password);
    const failing = db.$extends({
      query: {
        verificationToken: {
          async updateMany() {
            throw new Error("injected failure");
          },
        },
      },
    });
    const { UsersService } = await import("../src/modules/users/service.js");
    const users = new UsersService(failing as Database, config.APP_ORIGIN);
    await expect(
      users.changeStatus(admin.actor, target.id, "SUSPENDED"),
    ).rejects.toThrow("injected failure");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: target.id } })).status,
    ).toBe("ACTIVE");
    await expect(
      api.service.authenticate(`Bearer ${original.response.accessToken}`),
    ).resolves.toBeDefined();
    await expect(
      api.service.refresh(original.refreshToken),
    ).resolves.toBeDefined();
  });

  it("creates first/subsequent admins without sessions, preserves existing accounts and serializes duplicates", async () => {
    const { createAdmin } = await import("../src/modules/users/admin.js");
    const adminInput = { ...input, email: "bootstrap@example.test" };
    const results = await Promise.all([
      createAdmin(db, adminInput),
      createAdmin(db, adminInput),
    ]);
    expect(results.sort()).toEqual(["created", "unchanged"]);
    const account = await db.user.findUniqueOrThrow({
      where: { email: adminInput.email },
    });
    expect(account).toMatchObject({
      roleId: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: null,
    });
    expect(await bcrypt.compare(password, account.passwordHash!)).toBe(true);
    expect(bcrypt.getRounds(account.passwordHash!)).toBe(12);
    expect(await db.authSession.count()).toBe(0);
    await createAdmin(db, {
      ...adminInput,
      fullName: "Replacement Name",
      password: "Different bootstrap password!",
    });
    expect(
      await db.user.findUniqueOrThrow({ where: { id: account.id } }),
    ).toEqual(account);
    expect(
      await createAdmin(db, { ...adminInput, email: "second@example.test" }),
    ).toBe("created");
    const customer = await user("CUSTOMER", "conflict@example.test");
    await expect(
      createAdmin(db, { ...adminInput, email: customer.email }),
    ).rejects.toMatchObject({ status: 409 });
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    await expect(createAdmin(db, adminInput)).rejects.toMatchObject({
      status: 409,
    });
    await db.user.update({
      where: { id: account.id },
      data: { status: "INVITED" },
    });
    await expect(createAdmin(db, adminInput)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      createAdmin(db, { ...adminInput, password: "short" }),
    ).rejects.toThrow();
  });
});

describe("password recovery (auth plan 4.5)", () => {
  const GENERIC =
    "If an account can be reset, an email with a reset link will arrive shortly.";
  const tokenOf = (link: string) => link.split("#token=")[1]!;
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const forgot = (agent: Agent, email: string) =>
    post(agent, "forgot-password", { email });
  /** Lets the one-link-per-minute rule pass without waiting a minute. */
  const ageTokens = () =>
    db.passwordResetToken.updateMany({
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
  const NEW_PASSWORD = "A brand new passphrase 2026!";

  it("accepts every address the same way and sends a link only to an active password account", async () => {
    await user();
    const agent = request.agent(api.app);
    const known = await forgot(agent, input.email);
    const unknown = await forgot(request.agent(api.app), "nobody@example.test");
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(known.body).toEqual({ message: GENERIC });
    expect(unknown.body).toEqual(known.body);
    expect(resetLinks).toHaveLength(1);
    expect(resetLinks[0]).toMatch(
      /^http:\/\/localhost:5173\/auth\/reset-password#token=[A-Za-z0-9_-]{43}$/,
    );
    const stored = await db.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(sha(tokenOf(resetLinks[0]!)));
    expect(JSON.stringify(stored)).not.toContain(tokenOf(resetLinks[0]!));
    const lifetime = stored.expiresAt.getTime() - stored.createdAt.getTime();
    // createdAt comes from the database clock, expiresAt from the API's: allow a few ms.
    expect(Math.abs(lifetime - 30 * 60 * 1000)).toBeLessThan(5000);
  });

  it("sends nothing for suspended, invited or passwordless accounts, exactly like an unknown address", async () => {
    const suspended = await user("CUSTOMER", "suspended@example.test");
    await db.user.update({
      where: { id: suspended.id },
      data: { status: "SUSPENDED" },
    });
    const invited = await user("DISPATCHER", "invited@example.test");
    await db.user.update({
      where: { id: invited.id },
      data: { status: "INVITED", passwordHash: null },
    });
    const passwordless = await user("CUSTOMER", "gonly@example.test");
    await db.user.update({
      where: { id: passwordless.id },
      data: { passwordHash: null, googleSub: "google-only-sub" },
    });
    for (const email of [suspended.email, invited.email, passwordless.email]) {
      const res = await forgot(request.agent(api.app), email);
      expect([res.status, res.body]).toEqual([202, { message: GENERIC }]);
    }
    expect(resetLinks).toHaveLength(0);
    expect(await db.passwordResetToken.count()).toBe(0);
    // No local password is ever invented.
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: passwordless.id } }))
        .passwordHash,
    ).toBeNull();
  });

  it("issues one link per minute and replaces the older link", async () => {
    await user();
    await forgot(request.agent(api.app), input.email);
    await forgot(request.agent(api.app), input.email);
    expect(resetLinks).toHaveLength(1);
    await ageTokens();
    await forgot(request.agent(api.app), input.email);
    expect(resetLinks).toHaveLength(2);
    const first = await post(request.agent(api.app), "reset-password", {
      token: tokenOf(resetLinks[0]!),
      password: NEW_PASSWORD,
    });
    expect(first.status).toBe(400);
    const second = await post(request.agent(api.app), "reset-password", {
      token: tokenOf(resetLinks[1]!),
      password: NEW_PASSWORD,
    });
    expect(second.status).toBe(200);
  });

  it("stops mailing after three requests per address per hour, with the same answer", async () => {
    await user();
    for (let i = 0; i < 4; i++) {
      const res = await forgot(request.agent(api.app), input.email);
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ message: GENERIC });
      await ageTokens();
    }
    expect(resetLinks).toHaveLength(3);
  });

  it("does not let a mail outage change the answer or lose the account", async () => {
    await user();
    mailFailure = true;
    const res = await forgot(request.agent(api.app), input.email);
    expect(res.status).toBe(202);
    mailFailure = false;
    await ageTokens();
    await forgot(request.agent(api.app), input.email);
    expect(resetLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("sets the password once, signs the account out everywhere, and does not sign in", async () => {
    const account = await user();
    const agent = request.agent(api.app);
    const login = await post(agent, "login", { email: input.email, password });
    const access = login.body.accessToken as string;
    await forgot(request.agent(api.app), input.email);

    const reset = await post(request.agent(api.app), "reset-password", {
      token: tokenOf(resetLinks[0]!),
      password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
    expect(([] as string[]).concat(reset.headers["set-cookie"] ?? [])).toHaveLength(0);
    expect(reset.body.accessToken).toBeUndefined();

    // Old credentials and every existing session are gone.
    await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${access}`)
      .expect(401);
    expect((await post(agent, "refresh")).status).toBe(401);
    expect(
      (await post(request.agent(api.app), "login", { email: input.email, password }))
        .status,
    ).toBe(401);
    expect(
      (
        await post(request.agent(api.app), "login", {
          email: input.email,
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(200);
    const after = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(after).toMatchObject({ roleId: "CUSTOMER", status: "ACTIVE" });
  });

  it("works exactly once and gives one answer for every kind of bad token", async () => {
    await user();
    await forgot(request.agent(api.app), input.email);
    const token = tokenOf(resetLinks[0]!);
    const body = (t: string) => ({ token: t, password: NEW_PASSWORD });
    const used = await post(request.agent(api.app), "reset-password", body(token));
    expect(used.status).toBe(200);
    const replay = await post(request.agent(api.app), "reset-password", body(token));
    const unknown = await post(
      request.agent(api.app),
      "reset-password",
      body("A".repeat(43)),
    );
    const malformed = await post(
      request.agent(api.app),
      "reset-password",
      body("short"),
    );
    expect([replay.status, unknown.status, malformed.status]).toEqual([400, 400, 400]);
    expect(replay.body.code ?? replay.body.type).toBe(unknown.body.code ?? unknown.body.type);
    expect(replay.body.detail).toBe(unknown.body.detail);
  });

  it("refuses an expired token and leaves the password alone", async () => {
    await user();
    await forgot(request.agent(api.app), input.email);
    await db.passwordResetToken.updateMany({
      data: {
        createdAt: new Date(Date.now() - 3_600_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const res = await post(request.agent(api.app), "reset-password", {
      token: tokenOf(resetLinks[0]!),
      password: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(
      (await post(request.agent(api.app), "login", { email: input.email, password }))
        .status,
    ).toBe(200);
  });

  it("rejects a weak password without consuming the token", async () => {
    await user();
    await forgot(request.agent(api.app), input.email);
    const token = tokenOf(resetLinks[0]!);
    for (const weak of ["short", "films+pic+galeries", "x".repeat(80)]) {
      const res = await post(request.agent(api.app), "reset-password", {
        token,
        password: weak,
      });
      expect([400, 422]).toContain(res.status);
    }
    expect(
      (
        await post(request.agent(api.app), "reset-password", {
          token,
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(200);
  });

  it("lets only one of two simultaneous resets win", async () => {
    await user();
    await forgot(request.agent(api.app), input.email);
    const token = tokenOf(resetLinks[0]!);
    const results = await Promise.all(
      ["First concurrent passphrase 1!", "Second concurrent passphrase 2!"].map((p) =>
        post(request.agent(api.app), "reset-password", { token, password: p }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("does not unsuspend, and a suspended account's link is dead", async () => {
    const account = await user();
    await forgot(request.agent(api.app), input.email);
    await db.user.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    const res = await post(request.agent(api.app), "reset-password", {
      token: tokenOf(resetLinks[0]!),
      password: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: account.id } })).status,
    ).toBe("SUSPENDED");
  });

  it("keeps verification and reset tokens separate", async () => {
    await user();
    await forgot(request.agent(api.app), input.email);
    const verify = await post(request.agent(api.app), "verify-email", {
      token: tokenOf(resetLinks[0]!),
    });
    expect(verify.status).toBe(400);
    expect(await db.passwordResetToken.count({ where: { consumedAt: null } })).toBe(1);
    await post(request.agent(api.app), "resend-verification", { email: input.email });
    if (verificationLink) {
      const reuse = await post(request.agent(api.app), "reset-password", {
        token: verificationLink.split("#token=")[1]!,
        password: NEW_PASSWORD,
      });
      expect(reuse.status).toBe(400);
    }
  });
});

describe("change password and session management (auth plan 4.3)", () => {
  const NEW_PASSWORD = "Changed passphrase for tests 1!";
  async function signIn() {
    const agent = request.agent(api.app);
    const res = await post(agent, "login", { email: input.email, password });
    return { agent, access: res.body.accessToken as string };
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  /** DELETE /sessions/:id the way the SPA does: bearer, exact Origin and a CSRF token. */
  async function revokeSession(agent: Agent, token: string, id: string) {
    const context = await agent.get("/api/v1/auth/csrf").expect(200);
    return agent
      .delete(`/api/v1/auth/sessions/${id}`)
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", context.body.csrfToken)
      .set(bearer(token));
  }

  async function changePassword(agent: Agent, token: string, body: object) {
    const context = await agent.get("/api/v1/auth/csrf").expect(200);
    return agent
      .post("/api/v1/auth/change-password")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", context.body.csrfToken)
      .set(bearer(token))
      .send(body);
  }

  it("requires authentication and the right current password, and changes nothing otherwise", async () => {
    const account = await user();
    const before = account.passwordHash;
    expect(
      (await post(request.agent(api.app), "change-password", {
        currentPassword: password,
        newPassword: NEW_PASSWORD,
      })).status,
    ).toBe(401);
    const { agent, access } = await signIn();
    const wrong = await changePassword(agent, access, {
      currentPassword: "Not the current passphrase!",
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code ?? wrong.body.type).toMatch(/CURRENT_PASSWORD_INCORRECT/);
    const same = await changePassword(agent, access, {
      currentPassword: password,
      newPassword: password,
    });
    expect(same.status).toBe(400);
    const weak = await changePassword(agent, access, {
      currentPassword: password,
      newPassword: "short",
    });
    expect([400, 422]).toContain(weak.status);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash,
    ).toBe(before);
    await agent.get("/api/v1/auth/me").set(bearer(access)).expect(200);
  });

  it("replaces every session with one new session and a new password", async () => {
    await user();
    const first = await signIn();
    const other = await signIn();
    const res = await changePassword(first.agent, first.access, {
      currentPassword: password,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("authenticated");
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";")).toMatch(/swiftdrop-refresh=/);
    await first.agent.get("/api/v1/auth/me").set(bearer(first.access)).expect(401);
    await other.agent.get("/api/v1/auth/me").set(bearer(other.access)).expect(401);
    await first.agent
      .get("/api/v1/auth/me")
      .set(bearer(res.body.accessToken))
      .expect(200);
    expect((await post(other.agent, "refresh")).status).toBe(401);
    expect(
      (await post(request.agent(api.app), "login", { email: input.email, password }))
        .status,
    ).toBe(401);
    expect(
      (
        await post(request.agent(api.app), "login", {
          email: input.email,
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(200);
  });

  it("revokes a pending reset link when the password is changed deliberately", async () => {
    await user();
    await post(request.agent(api.app), "forgot-password", { email: input.email });
    const link = resetLinks[0]!;
    const { agent, access } = await signIn();
    await changePassword(agent, access, {
      currentPassword: password,
      newPassword: NEW_PASSWORD,
    });
    const res = await post(request.agent(api.app), "reset-password", {
      token: link.split("#token=")[1]!,
      password: "Another passphrase for tests 3!",
    });
    expect(res.status).toBe(400);
  });

  it("limits guesses at the current password", async () => {
    await user();
    const { agent, access } = await signIn();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await changePassword(agent, access, {
            currentPassword: `wrong guess number ${i} here`,
            newPassword: NEW_PASSWORD,
          })
        ).status,
      );
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
  });

  it("lists only the caller's live sessions, marks the current one and exposes no secrets", async () => {
    const account = await user();
    const other = await user("CUSTOMER", "someone-else@example.test");
    const mine = await signIn();
    await signIn();
    await api.service.login(other.email, password);
    const res = await mine.agent.get("/api/v1/auth/sessions").set(bearer(mine.access));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      ["absoluteExpiresAt", "authenticatedAt", "current", "id", "idleExpiresAt", "lastRefreshedAt"],
    );
    const ids = await db.authSession.findMany({ where: { userId: account.id } });
    expect(res.body.items.map((s: { id: string }) => s.id).sort()).toEqual(
      ids.map((s) => s.id).sort(),
    );
    await request(api.app).get("/api/v1/auth/sessions").expect(401);
  });

  it("omits revoked and expired sessions", async () => {
    const account = await user();
    const mine = await signIn();
    const revoked = await api.service.login(input.email, password);
    const idle = await api.service.login(input.email, password);
    await api.service.logout(revoked.refreshToken);
    const idleRow = await db.authSession.findMany({
      where: { userId: account.id, revokedAt: null },
      orderBy: { authenticatedAt: "desc" },
    });
    await db.authSession.update({
      where: { id: idleRow[0]!.id },
      data: { idleExpiresAt: new Date(Date.now() - 1000) },
    });
    void idle;
    const res = await mine.agent.get("/api/v1/auth/sessions").set(bearer(mine.access));
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].current).toBe(true);
  });

  it("revokes another session at once and leaves the caller signed in", async () => {
    await user();
    const mine = await signIn();
    const other = await signIn();
    const list = await mine.agent.get("/api/v1/auth/sessions").set(bearer(mine.access));
    const target = list.body.items.find((s: { current: boolean }) => !s.current);
    const res = await revokeSession(mine.agent, mine.access, target.id);
    expect(res.status).toBe(204);
    await other.agent.get("/api/v1/auth/me").set(bearer(other.access)).expect(401);
    expect((await post(other.agent, "refresh")).status).toBe(401);
    await mine.agent.get("/api/v1/auth/me").set(bearer(mine.access)).expect(200);
    // Revoking again is harmless.
    expect((await revokeSession(mine.agent, mine.access, target.id)).status).toBe(204);
  });

  it("signs this browser out when its own session is revoked", async () => {
    await user();
    const mine = await signIn();
    const list = await mine.agent.get("/api/v1/auth/sessions").set(bearer(mine.access));
    const current = list.body.items.find((s: { current: boolean }) => s.current);
    const res = await revokeSession(mine.agent, mine.access, current.id);
    expect(res.status).toBe(204);
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";")).toMatch(/swiftdrop-refresh=;/);
    await mine.agent.get("/api/v1/auth/me").set(bearer(mine.access)).expect(401);
  });

  it("hides other accounts' sessions behind 404 and leaves them untouched", async () => {
    const victim = await user("CUSTOMER", "victim@example.test");
    const theirs = await api.service.login(victim.email, password);
    const theirId = (await db.authSession.findFirstOrThrow({ where: { userId: victim.id } })).id;
    await user();
    const mine = await signIn();
    for (const id of [theirId, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      const res = await revokeSession(mine.agent, mine.access, id);
      expect(res.status).toBe(404);
    }
    await expect(
      api.service.authenticate(`Bearer ${theirs.response.accessToken}`),
    ).resolves.toBeDefined();
    expect(
      (await db.authSession.findUniqueOrThrow({ where: { id: theirId } })).revokedAt,
    ).toBeNull();
  });

  it("requires the CSRF token and the exact Origin to revoke a session", async () => {
    await user();
    const mine = await signIn();
    const list = await mine.agent.get("/api/v1/auth/sessions").set(bearer(mine.access));
    const id = list.body.items[0].id;
    const context = await mine.agent.get("/api/v1/auth/csrf").expect(200);
    const noToken = await mine.agent
      .delete(`/api/v1/auth/sessions/${id}`)
      .set("Origin", config.APP_ORIGIN)
      .set(bearer(mine.access));
    const badOrigin = await mine.agent
      .delete(`/api/v1/auth/sessions/${id}`)
      .set("Origin", "https://evil.example.test")
      .set("X-CSRF-Token", context.body.csrfToken)
      .set(bearer(mine.access));
    expect([noToken.status, badOrigin.status]).toEqual([403, 403]);
    await mine.agent.get("/api/v1/auth/me").set(bearer(mine.access)).expect(200);
  });

  it("pages sessions newest activity first with a stable cursor and rejects a bad one", async () => {
    const account = await user();
    const mine = await signIn();
    for (let i = 0; i < 4; i++) await api.service.login(input.email, password);
    // Spread last-activity times so the order is unambiguous.
    const rows = await db.authSession.findMany({ where: { userId: account.id } });
    await Promise.all(
      rows.map((row, index) =>
        db.authSession.update({
          where: { id: row.id },
          data: { lastRefreshedAt: new Date(Date.now() - index * 60_000) },
        }),
      ),
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await mine.agent
        .get(`/api/v1/auth/sessions?${query}`)
        .set(bearer(mine.access));
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.items.map((s: { id: string }) => s.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    const ordered = await db.authSession.findMany({
      where: { userId: account.id },
      orderBy: [{ lastRefreshedAt: "desc" }, { id: "asc" }],
    });
    expect(seen).toEqual(ordered.map((r) => r.id));
    for (const bad of ["not-a-cursor", Buffer.from("x|y").toString("base64url")]) {
      const res = await mine.agent
        .get(`/api/v1/auth/sessions?cursor=${bad}`)
        .set(bearer(mine.access));
      expect(res.status).toBe(400);
    }
    for (const badLimit of ["0", "51", "abc"]) {
      const res = await mine.agent
        .get(`/api/v1/auth/sessions?limit=${badLimit}`)
        .set(bearer(mine.access));
      expect([400, 422]).toContain(res.status);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Audit trail, recent-authentication and the second factor (auth plan 4.7, section 6)
// ---------------------------------------------------------------------------------------------
describe("audit trail, recent authentication and MFA", () => {
  const NEW_PASSWORD = "Another long test passphrase 9!";
  const bearerHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
  const secretsSeen = [password, NEW_PASSWORD, "wrong-password-entirely"];

  /** An authenticated mutation the way the SPA sends one: bearer, exact Origin and CSRF token. */
  async function authed(
    agent: Agent,
    method: "post" | "delete" | "patch",
    path: string,
    token: string,
    body?: object,
  ) {
    const context = await agent.get("/api/v1/auth/csrf").expect(200);
    const req = agent[method](path)
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", context.body.csrfToken)
      .set(bearerHeader(token));
    return body === undefined ? req : req.send(body);
  }
  async function signIn(email = input.email, pw = password) {
    const agent = request.agent(api.app);
    const res = await post(agent, "login", { email, password: pw });
    return { agent, res, access: res.body.accessToken as string };
  }
  const mfaOf = () => api.service.mfa!;
  const secretOf = async (userId: number) => {
    const factor = await db.mfaFactor.findUniqueOrThrow({ where: { userId } });
    return mfaOf().decryptSecret(factor.encryptedSecret, factor.keyVersion);
  };
  /** A currently valid code, resetting the replay guard so a test can use several in a row. */
  async function freshCode(userId: number) {
    await db.mfaFactor.update({ where: { userId }, data: { lastUsedStep: null } });
    return totpAt(await secretOf(userId), Date.now());
  }
  const age = (userId: number, minutes: number) =>
    db.authSession.updateMany({
      where: { userId },
      data: {
        authenticatedAt: new Date(Date.now() - minutes * 60_000),
        reauthenticatedAt: null,
        mfaVerifiedAt: null,
      },
    });
  /** Enrols and confirms a factor for a freshly signed-in user; returns the recovery codes. */
  async function enableMfa(agent: Agent, access: string, userId: number) {
    const enrol = await authed(agent, "post", "/api/v1/auth/mfa/enrol", access, {});
    expect(enrol.status).toBe(200);
    const code = totpAt(enrol.body.secret, Date.now());
    const confirm = await authed(agent, "post", "/api/v1/auth/mfa/confirm", access, { code });
    expect(confirm.status).toBe(200);
    expect(await db.mfaFactor.count({ where: { userId, confirmedAt: { not: null } } })).toBe(1);
    return confirm.body.recoveryCodes as string[];
  }
  const eventsOf = (type: string) =>
    db.authAuditEvent.findMany({ where: { eventType: type }, orderBy: { occurredAt: "asc" } });

  describe("audit trail", () => {
    it("records sign-in successes and failures without ever storing credentials", async () => {
      const account = await user();
      await post(request.agent(api.app), "login", { email: input.email, password: "wrong-password-entirely" });
      await post(request.agent(api.app), "login", { email: "nobody@example.test", password: "wrong-password-entirely" });
      const ok = await signIn();
      expect(ok.res.status).toBe(200);
      const logins = await eventsOf("LOGIN");
      expect(logins.map((e) => [e.outcome, e.targetUserId])).toEqual([
        ["FAILURE", account.id],
        ["FAILURE", null],
        ["SUCCESS", account.id],
      ]);
      expect(logins[2]).toMatchObject({ actorUserId: account.id, metadata: { method: "password" } });
      const everything = JSON.stringify(await db.authAuditEvent.findMany());
      for (const secret of [...secretsSeen, input.email, "nobody@example.test", ok.access])
        expect(everything).not.toContain(secret);
    });

    it("records logout, logout-all, session revocation, refresh reuse and password changes", async () => {
      const account = await user();
      const first = await signIn();
      const second = await signIn();
      await post(second.agent, "logout");
      await authed(first.agent, "post", "/api/v1/auth/logout-all", first.access, {});
      const third = await signIn();
      const change = await authed(third.agent, "post", "/api/v1/auth/change-password", third.access, {
        currentPassword: password,
        newPassword: NEW_PASSWORD,
      });
      expect(change.status).toBe(200);
      await authed(third.agent, "post", "/api/v1/auth/change-password", change.body.accessToken, {
        currentPassword: "wrong-password-entirely",
        newPassword: password,
      });
      const types = (await db.authAuditEvent.findMany({ orderBy: { occurredAt: "asc" } })).map(
        (e) => `${e.eventType}:${e.outcome}`,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          "LOGOUT:SUCCESS",
          "LOGOUT_ALL:SUCCESS",
          "PASSWORD_CHANGE:SUCCESS",
          "PASSWORD_CHANGE:FAILURE",
        ]),
      );
      for (const event of await db.authAuditEvent.findMany({ where: { eventType: { in: ["LOGOUT", "LOGOUT_ALL", "PASSWORD_CHANGE"] } } }))
        expect(event.targetUserId).toBe(account.id);
    });

    it("records the reuse of a consumed refresh token as a failure against the account", async () => {
      const account = await user();
      const login = await api.service.login(input.email, password);
      const rotated = await api.service.refresh(login.refreshToken);
      expect(rotated.refreshToken).not.toBe(login.refreshToken);
      await expect(api.service.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401 });
      const reuse = await eventsOf("REFRESH_REUSE");
      expect(reuse).toHaveLength(1);
      expect(reuse[0]).toMatchObject({ outcome: "FAILURE", targetUserId: account.id });
    });

    it("records password reset requests and completions, and carries the request's correlation id", async () => {
      const account = await user();
      const agent = request.agent(api.app);
      const context = await agent.get("/api/v1/auth/csrf").expect(200);
      await agent
        .post("/api/v1/auth/forgot-password")
        .set("Origin", config.APP_ORIGIN)
        .set("X-CSRF-Token", context.body.csrfToken)
        .set("X-Correlation-ID", "audit-trace-0001")
        .send({ email: input.email })
        .expect(202);
      const link = resetLinks.at(-1)!;
      await post(request.agent(api.app), "reset-password", {
        token: link.split("#token=")[1]!,
        password: NEW_PASSWORD,
      });
      const requested = await eventsOf("PASSWORD_RESET_REQUESTED");
      expect(requested).toHaveLength(1);
      expect(requested[0]).toMatchObject({ targetUserId: account.id, correlationId: "audit-trace-0001" });
      expect(await eventsOf("PASSWORD_RESET")).toHaveLength(1);
    });

    it("lets only an Admin read the trail, newest first, with filters and a stable cursor", async () => {
      const customer = await user();
      const admin = await user("ADMIN", "audit-admin@example.test");
      for (let i = 0; i < 3; i++) await signIn();
      const dispatcher = await user("DISPATCHER", "audit-dispatcher@example.test");
      const adminSession = await signIn(admin.email);
      const url = "/api/v1/admin/audit-events";
      expect((await request(api.app).get(url)).status).toBe(401);
      for (const who of [await signIn(), await signIn(dispatcher.email)])
        expect((await who.agent.get(url).set(bearerHeader(who.access))).status).toBe(403);

      const first = await adminSession.agent.get(`${url}?limit=2`).set(bearerHeader(adminSession.access));
      expect(first.status).toBe(200);
      expect(first.headers["cache-control"]).toBe("no-store");
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await adminSession.agent
        .get(`${url}?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
        .set(bearerHeader(adminSession.access));
      const ids = [...first.body.items, ...second.body.items].map((e: { id: string }) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      const times = first.body.items.map((e: { occurredAt: string }) => e.occurredAt);
      expect([...times].sort().reverse()).toEqual(times);

      const mine = await adminSession.agent
        .get(`${url}?userId=${customer.id}&eventType=LOGIN&limit=200`)
        .set(bearerHeader(adminSession.access));
      expect(mine.body.items.length).toBeGreaterThanOrEqual(3);
      expect(mine.body.items.every((e: { eventType: string; targetUserId: number }) => e.eventType === "LOGIN" && e.targetUserId === customer.id)).toBe(true);
      for (const bad of ["cursor=not-valid", "eventType=NOPE", "limit=0", "limit=201", "userId=abc"])
        expect([400, 422]).toContain(
          (await adminSession.agent.get(`${url}?${bad}`).set(bearerHeader(adminSession.access))).status,
        );
    });

    it("keeps the trail when the account is deleted and removes only events past retention", async () => {
      const account = await user();
      await signIn();
      // Sessions hold a RESTRICT-style reference to the user; the audit rows deliberately do not.
      await db.authSession.deleteMany({ where: { userId: account.id } });
      await db.user.delete({ where: { id: account.id } });
      expect(await db.authAuditEvent.count({ where: { targetUserId: account.id } })).toBeGreaterThan(0);
      await db.authAuditEvent.create({
        data: { eventType: "LOGIN", outcome: "SUCCESS", occurredAt: new Date(Date.now() - 400 * 86_400_000) },
      });
      const removed = await cleanupAuth(db, new Date(), { auditRetentionDays: 365 });
      expect(removed.auditEvents).toBe(1);
      expect(await db.authAuditEvent.count({ where: { targetUserId: account.id } })).toBeGreaterThan(0);
    });
  });

  describe("recent authentication", () => {
    async function adminAndTarget() {
      await user("ADMIN", "recent-admin@example.test");
      const target = await user("CUSTOMER", "target@example.test");
      const admin = await signIn("recent-admin@example.test");
      return { admin, target };
    }
    const suspend = (admin: Awaited<ReturnType<typeof signIn>>, id: number, token = admin.access) =>
      authed(admin.agent, "patch", `/api/v1/admin/users/${id}/status`, token, { status: "SUSPENDED" });

    it("lets a sensitive action through right after sign-in and refuses it once the proof is old", async () => {
      const { admin, target } = await adminAndTarget();
      await age((await db.user.findUniqueOrThrow({ where: { email: "recent-admin@example.test" } })).id, 10);
      const refused = await suspend(admin, target.id);
      expect(refused.status).toBe(403);
      expect(refused.body.code ?? refused.body.type).toMatch(/REAUTH_REQUIRED/);
      expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("ACTIVE");
    });

    it("is restored by confirming the password, but not by a refresh", async () => {
      const { admin, target } = await adminAndTarget();
      const adminId = (await db.user.findUniqueOrThrow({ where: { email: "recent-admin@example.test" } })).id;
      await age(adminId, 10);
      const refreshed = await post(admin.agent, "refresh");
      expect(refreshed.status).toBe(200);
      expect((await suspend(admin, target.id, refreshed.body.accessToken)).status).toBe(403);

      const wrong = await authed(admin.agent, "post", "/api/v1/auth/reauthenticate", refreshed.body.accessToken, { password: "wrong-password-entirely" });
      expect(wrong.status).toBe(400);
      expect((await suspend(admin, target.id, refreshed.body.accessToken)).status).toBe(403);

      const ok = await authed(admin.agent, "post", "/api/v1/auth/reauthenticate", refreshed.body.accessToken, { password });
      expect(ok.status).toBe(200);
      expect(Date.parse(ok.body.reauthenticatedAt)).toBeGreaterThan(Date.now() - 5000);
      expect((await suspend(admin, target.id, refreshed.body.accessToken)).status).toBe(200);
      const audit = await eventsOf("REAUTHENTICATE");
      expect(audit.map((e) => e.outcome)).toEqual(["FAILURE", "SUCCESS"]);
    });

    it("limits confirmation guesses per account", async () => {
      await user();
      const { agent, access } = await signIn();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++)
        statuses.push((await authed(agent, "post", "/api/v1/auth/reauthenticate", access, { password: `wrong guess ${i} here!!` })).status);
      expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
      expect(statuses[5]).toBe(429);
    });

    it("applies to credential management as well as to account administration", async () => {
      const owner = await user("MERCHANT", "recent-merchant@example.test");
      await db.merchant.create({
        data: { userId: owner.id, businessName: "Recent Shop", status: "APPROVED", reviewedAt: new Date() },
      });
      const session = await signIn(owner.email);
      const make = () => authed(session.agent, "post", "/api/v1/merchant/clients", session.access, { name: "Key one", scopes: ["orders:read"] });
      expect((await make()).status).toBe(201);
      await age(owner.id, 10);
      expect((await make()).status).toBe(403);
      await authed(session.agent, "post", "/api/v1/auth/reauthenticate", session.access, { password });
      expect((await make()).status).toBe(201);
    });
  });

  describe("second factor (TOTP)", () => {
    it("enrols in two steps and only a confirmed factor changes sign-in", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      const status = (token = access) => agent.get("/api/v1/auth/mfa").set(bearerHeader(token));
      expect((await status()).body).toEqual({ enabled: false, pendingEnrolment: false, recoveryCodesRemaining: 0, required: false });

      const enrol = await authed(agent, "post", "/api/v1/auth/mfa/enrol", access, {});
      expect(enrol.status).toBe(200);
      expect(enrol.body.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(enrol.body.otpauthUri).toContain("issuer=SwiftDrop");
      expect(enrol.body.otpauthUri).toContain(enrol.body.secret);
      expect((await status()).body).toMatchObject({ enabled: false, pendingEnrolment: true });
      const stored = await db.mfaFactor.findUniqueOrThrow({ where: { userId: account.id } });
      expect(stored.encryptedSecret).not.toContain(enrol.body.secret);
      expect(stored.confirmedAt).toBeNull();
      // Pending means sign-in is still password only.
      expect((await signIn()).res.body.state).toBe("authenticated");

      const wrong = await authed(agent, "post", "/api/v1/auth/mfa/confirm", access, { code: "000000" });
      expect(wrong.status).toBe(400);
      expect((await status()).body.enabled).toBe(false);
      const code = totpAt(enrol.body.secret, Date.now());
      const confirm = await authed(agent, "post", "/api/v1/auth/mfa/confirm", access, { code });
      expect(confirm.status).toBe(200);
      expect(confirm.body.recoveryCodes).toHaveLength(10);
      for (const c of confirm.body.recoveryCodes) expect(c).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
      expect(new Set(confirm.body.recoveryCodes).size).toBe(10);
      expect((await status()).body).toMatchObject({ enabled: true, pendingEnrolment: false, recoveryCodesRemaining: 10 });
      // Only keyed hashes of the codes are stored.
      const hashes = (await db.mfaRecoveryCode.findMany()).map((c) => c.codeHash);
      for (const c of confirm.body.recoveryCodes) expect(hashes).not.toContain(c);
      expect((await authed(agent, "post", "/api/v1/auth/mfa/enrol", access, {})).status).toBe(409);
      expect((await eventsOf("MFA_ENABLED")).map((e) => e.outcome)).toEqual(["FAILURE", "SUCCESS"]);
    });

    it("requires a recent password proof to start enrolment and an authenticated user throughout", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await age(account.id, 10);
      const refused = await authed(agent, "post", "/api/v1/auth/mfa/enrol", access, {});
      expect(refused.status).toBe(403);
      expect(await db.mfaFactor.count()).toBe(0);
      expect((await post(request.agent(api.app), "mfa/confirm", { code: "123456" })).status).toBe(401);
      expect((await request(api.app).get("/api/v1/auth/mfa")).status).toBe(401);
    });

    it("turns a correct password into a challenge, not a session", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await enableMfa(agent, access, account.id);
      const login = await post(request.agent(api.app), "login", { email: input.email, password });
      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({ state: "mfa_required", expiresIn: 300 });
      expect(login.body.accessToken).toBeUndefined();
      expect(([] as string[]).concat(login.headers["set-cookie"] ?? []).join(";")).not.toMatch(/refresh=/);
      expect(login.body.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await db.mfaChallenge.findFirstOrThrow();
      expect(stored.tokenHash).toBe(createHash("sha256").update(login.body.challengeToken).digest("hex"));
      // The token alone is no credential.
      await request(api.app).get("/api/v1/auth/me").set(bearerHeader(login.body.challengeToken)).expect(401);
    });

    it("completes sign-in with a current code and refuses a replay of that code", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await enableMfa(agent, access, account.id);
      const challenge = async () =>
        (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken as string;
      const code = await freshCode(account.id);
      const token = await challenge();
      const verifier = request.agent(api.app);
      const done = await post(verifier, "mfa/challenge/verify", { challengeToken: token, code });
      expect(done.status).toBe(200);
      expect(done.body.state).toBe("authenticated");
      expect(([] as string[]).concat(done.headers["set-cookie"] ?? []).join(";")).toMatch(/swiftdrop-refresh=/);
      await verifier.get("/api/v1/auth/me").set(bearerHeader(done.body.accessToken)).expect(200);
      const session = await db.authSession.findFirstOrThrow({ where: { userId: account.id }, orderBy: { authenticatedAt: "desc" } });
      expect(session.mfaVerifiedAt).not.toBeNull();
      // The same code, even on a fresh challenge, is a replay.
      const replay = await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: await challenge(), code });
      expect(replay.status).toBe(401);
      expect(replay.body.code ?? replay.body.type).toMatch(/MFA_CHALLENGE_INVALID/);
      // A used challenge is dead.
      expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: token, code: await freshCode(account.id) })).status).toBe(401);
    });

    it("kills a challenge after five wrong codes, even for the right one", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await enableMfa(agent, access, account.id);
      const token = (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken;
      for (let i = 0; i < 5; i++)
        expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: token, code: "000000" })).status).toBe(401);
      expect((await db.mfaChallenge.findFirstOrThrow()).attempts).toBe(5);
      const right = await freshCode(account.id);
      expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: token, code: right })).status).toBe(401);
      expect((await eventsOf("MFA_CHALLENGE")).filter((e) => e.outcome === "FAILURE")).toHaveLength(5);
    });

    it("refuses expired, unknown and malformed challenges and a suspended account", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await enableMfa(agent, access, account.id);
      const token = (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken;
      const code = await freshCode(account.id);
      await db.mfaChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: token, code })).status).toBe(401);
      expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: "A".repeat(43), code })).status).toBe(401);
      expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: "short", code })).status).toBe(400);
      const fresh = (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken;
      await db.user.update({ where: { id: account.id }, data: { status: "SUSPENDED" } });
      expect((await post(request.agent(api.app), "mfa/challenge/verify", { challengeToken: fresh, code })).status).toBe(401);
    });

    it("allows exactly one of two simultaneous submissions of the same code", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await enableMfa(agent, access, account.id);
      const code = await freshCode(account.id);
      const [a, b] = await Promise.all(
        [0, 1].map(async () => {
          const token = (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken;
          return token as string;
        }),
      );
      // Two challenges cannot coexist (a newer password step replaces the older one), so the
      // race is two submissions against whichever challenge survived.
      const live = (await db.mfaChallenge.findFirstOrThrow()).tokenHash;
      const token = [a, b].find((t) => createHash("sha256").update(t).digest("hex") === live)!;
      const results = await Promise.all(
        [0, 1].map(() => api.service.verifyMfaChallenge(token, code).then(() => "ok", () => "refused")),
      );
      expect(results.sort()).toEqual(["ok", "refused"]);
    });

    it("signs in with a recovery code once and shows how many are left", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      const codes = await enableMfa(agent, access, account.id);
      const use = async (recoveryCode: string) =>
        post(request.agent(api.app), "mfa/challenge/recover", {
          challengeToken: (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken,
          recoveryCode,
        });
      const ok = await use(codes[0]!.toLowerCase().replace("-", " "));
      expect(ok.status).toBe(200);
      expect(ok.body.state).toBe("authenticated");
      expect((await use(codes[0]!)).status).toBe(401);
      expect((await use("AAAAA-AAAAA")).status).toBe(401);
      const status = await agent.get("/api/v1/auth/mfa").set(bearerHeader(ok.body.accessToken));
      expect(status.body.recoveryCodesRemaining).toBe(9);
      const used = await eventsOf("MFA_RECOVERY_CODE_USED");
      expect(used).toHaveLength(1);
      expect(used[0]!.metadata).toMatchObject({ remaining: 9 });
    });

    it("lets only one of two simultaneous uses of a recovery code win", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      const codes = await enableMfa(agent, access, account.id);
      const challenges = await Promise.all(
        [0, 1].map(async () => {
          // Separate accounts' worth of challenges are not possible, so insert a second row.
          const raw = randomUUID().replace(/-/g, "").padEnd(43, "x").slice(0, 43);
          await db.mfaChallenge.create({
            data: { userId: account.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 60_000) },
          });
          return raw;
        }),
      );
      const results = await Promise.all(
        challenges.map((t) => api.service.recoverMfaChallenge(t, codes[1]!).then(() => "ok", () => "refused")),
      );
      expect(results.sort()).toEqual(["ok", "refused"]);
    });

    it("needs a code to confirm the password and to change the factor, and replaces recovery codes", async () => {
      const account = await user();
      const first = await signIn();
      const oldCodes = await enableMfa(first.agent, first.access, account.id);
      // A new session must pass the challenge first.
      const code0 = await freshCode(account.id);
      const challenge = (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken;
      const session = request.agent(api.app);
      const done = await post(session, "mfa/challenge/verify", { challengeToken: challenge, code: code0 });
      const token = done.body.accessToken as string;

      const noCode = await authed(session, "post", "/api/v1/auth/reauthenticate", token, { password });
      expect(noCode.status).toBe(400);
      expect(noCode.body.code ?? noCode.body.type).toMatch(/MFA_CODE_REQUIRED/);
      await age(account.id, 10);
      expect((await authed(session, "post", "/api/v1/auth/mfa/recovery-codes", token, {})).status).toBe(403);
      const badCode = await authed(session, "post", "/api/v1/auth/reauthenticate", token, { password, code: "000000" });
      expect(badCode.status).toBe(400);
      const ok = await authed(session, "post", "/api/v1/auth/reauthenticate", token, { password, code: await freshCode(account.id) });
      expect(ok.status).toBe(200);

      const regenerated = await authed(session, "post", "/api/v1/auth/mfa/recovery-codes", token, {});
      expect(regenerated.status).toBe(200);
      const newCodes = regenerated.body.recoveryCodes as string[];
      expect(newCodes).toHaveLength(10);
      expect(newCodes.some((c) => oldCodes.includes(c))).toBe(false);
      const old = await post(request.agent(api.app), "mfa/challenge/recover", {
        challengeToken: (await post(request.agent(api.app), "login", { email: input.email, password })).body.challengeToken,
        recoveryCode: oldCodes[2]!,
      });
      expect(old.status).toBe(401);
      expect(await eventsOf("MFA_RECOVERY_CODES_REGENERATED")).toHaveLength(1);
    });

    it("disables the factor after fresh proof and removes everything it created", async () => {
      const account = await user();
      const first = await signIn();
      await enableMfa(first.agent, first.access, account.id);
      await age(account.id, 10);
      expect((await authed(first.agent, "delete", "/api/v1/auth/mfa", first.access)).status).toBe(403);
      await authed(first.agent, "post", "/api/v1/auth/reauthenticate", first.access, { password, code: await freshCode(account.id) });
      const gone = await authed(first.agent, "delete", "/api/v1/auth/mfa", first.access);
      expect(gone.status).toBe(204);
      expect(await db.mfaFactor.count()).toBe(0);
      expect(await db.mfaRecoveryCode.count()).toBe(0);
      expect((await signIn()).res.body.state).toBe("authenticated");
      expect((await authed(first.agent, "delete", "/api/v1/auth/mfa", first.access)).status).toBe(409);
      expect((await eventsOf("MFA_DISABLED")).map((e) => e.outcome)).toEqual(["SUCCESS"]);
    });

    it("keeps the factor when the password is reset", async () => {
      const account = await user();
      const { agent, access } = await signIn();
      await enableMfa(agent, access, account.id);
      await post(request.agent(api.app), "forgot-password", { email: input.email });
      await post(request.agent(api.app), "reset-password", { token: resetLinks.at(-1)!.split("#token=")[1]!, password: NEW_PASSWORD });
      const login = await post(request.agent(api.app), "login", { email: input.email, password: NEW_PASSWORD });
      expect(login.body.state).toBe("mfa_required");
      expect(await db.mfaFactor.count({ where: { userId: account.id, confirmedAt: { not: null } } })).toBe(1);
    });

    it("limits guesses at the confirmation code", async () => {
      await user();
      const { agent, access } = await signIn();
      await authed(agent, "post", "/api/v1/auth/mfa/enrol", access, {});
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++)
        statuses.push((await authed(agent, "post", "/api/v1/auth/mfa/confirm", access, { code: "000000" })).status);
      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe("required roles (MFA_REQUIRED_ROLES)", () => {
    it("blocks privileged routes until a factor exists, then allows them, and forbids turning it off", async () => {
      const tokens = await createTokenService(config);
      const strict = createApp({
        db,
        redis,
        config: { ...config, MFA_REQUIRED_ROLES: ["ADMIN"] } as Config,
        tokens,
        logger: pino({ enabled: false }),
      });
      const admin = await user("ADMIN", "mfa-admin@example.test");
      const customer = await user("CUSTOMER", "mfa-customer@example.test");
      const agent = request.agent(strict.app);
      const login = await post(agent, "login", { email: admin.email, password });
      const access = login.body.accessToken as string;
      const users = () => agent.get("/api/v1/admin/users").set(bearerHeader(access));

      const blocked = await users();
      expect(blocked.status).toBe(403);
      expect(blocked.body.code ?? blocked.body.type).toMatch(/MFA_ENROLMENT_REQUIRED/);
      expect((await agent.get("/api/v1/auth/mfa").set(bearerHeader(access))).body.required).toBe(true);
      expect((await agent.get("/api/v1/auth/me").set(bearerHeader(access))).status).toBe(200);

      const enrol = await authed(agent, "post", "/api/v1/auth/mfa/enrol", access, {});
      expect(enrol.status).toBe(200);
      expect((await users()).status).toBe(403); // pending is not enough
      const confirm = await authed(agent, "post", "/api/v1/auth/mfa/confirm", access, { code: totpAt(enrol.body.secret, Date.now()) });
      expect(confirm.status).toBe(200);
      expect((await users()).status).toBe(200);

      const off = await authed(agent, "delete", "/api/v1/auth/mfa", access);
      expect(off.status).toBe(403);
      expect(off.body.code ?? off.body.type).toMatch(/MFA_REQUIRED_FOR_ROLE/);
      expect(await db.mfaFactor.count({ where: { userId: admin.id, confirmedAt: { not: null } } })).toBe(1);

      // Roles outside the list are unaffected.
      const other = request.agent(strict.app);
      const cLogin = await post(other, "login", { email: customer.email, password });
      expect((await other.get("/api/v1/parcels").set(bearerHeader(cLogin.body.accessToken))).status).not.toBe(403);
    });
  });
});
