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
import { generateKeyPairSync, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { Redis } from "ioredis";
import pino from "pino";
import { createDatabase, type Database, RoleName } from "@swiftdrop/db";
import { isSwiftDropEvent, ROUTING_KEYS } from "@swiftdrop/contracts";
import { createApp } from "../src/app.js";
import { createInternalApp } from "../src/internal-app.js";
import { signServiceEventToken } from "../src/modules/services/signing.js";
import { cleanupAuth } from "../src/modules/auth/index.js";
import { createTokenService } from "../src/modules/auth/jwt.js";
import { tokenHash } from "../src/modules/auth/service.js";
import type { GoogleOidc } from "../src/modules/auth/google.js";
import type { Config } from "../src/shared/config.js";
const root = resolve(import.meta.dirname, "../../..");
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
  execFileSync(
    "pnpm",
    ["--filter", "@swiftdrop/db", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseURL },
      stdio: "pipe",
    },
  );
  try {
    execFileSync(
      "pnpm",
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
    oauthSecret: "c".repeat(64),
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
  await db.$executeRaw`TRUNCATE outbox_events, consumer_progress, idempotency_records, service_principals CASCADE`;
  await redis.flushdb();
  verificationLink = "";
  invitationLink = "";
  mailFailure = false;
  googleIdentityEmail = "google@example.test";
});
afterAll(async () => {
  await db?.$disconnect();
  redis?.disconnect();
  await redisContainer?.stop();
  await postgres?.stop();
});
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

  it("keeps courier invitations unconsumed until operational setup is ready", async () => {
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
    const rawToken = new URL(invitationLink).hash.slice("#token=".length);
    expect(
      (await post(agent, "accept-invite", { token: rawToken, password }))
        .status,
    ).toBe(409);
    expect(
      await db.staffInvitation.findFirstOrThrow({
        where: { userId: courier.id },
      }),
    ).toMatchObject({ consumedAt: null, revokedAt: null });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: courier.id } })).status,
    ).toBe("INVITED");
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
    expect(booked.body.trackingNumber).toMatch(/^SD[A-Z0-9]{8}$/);
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
    expect(event.payload).toMatchObject({
      type: ROUTING_KEYS.PARCEL_CREATED,
      version: 1,
      sequence: 1,
      data: { parcelId: booked.body.id },
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
