import { describe, it, expect } from "@jest/globals";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import request from "supertest";
import type { Database } from "@swiftdrop/db";
import type { Config } from "../src/shared/config.js";
import { createInternalApp } from "../src/internal-app.js";
import { signServiceEventToken } from "../src/modules/services/signing.js";

const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  parcel: "22222222-2222-4222-8222-222222222222",
};
const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const privateKey = pair.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const publicKeyPem = pair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const principal = {
  serviceId: "notification-svc",
  serviceKind: "notification",
  audience: "notifications-test",
  permissions: ["notifications:lookup"],
  revokedAt: null,
};
const key = {
  keyId: "notification-key-1",
  serviceId: principal.serviceId,
  publicKeyPem,
  notBefore: new Date(Date.now() - 60_000),
  notAfter: null,
  revokedAt: null,
  principal,
};
const event = {
  eventId: ids.event,
  eventType: "parcel.created",
  aggregateId: ids.parcel,
  payload: {
    eventId: ids.event,
    eventType: "parcel.created",
    parcelId: ids.parcel,
  },
};
const parcel = {
  id: ids.parcel,
  trackingNumber: "SD1234567A",
  recipientName: "Recipient",
  recipientPhone: "+94771234567",
  user: { email: "customer@example.test" },
};
let revoked = false;
let keyRevoked = false;
let keyExpiresAt: Date | null = null;
let lookupUnavailable = false;
let eventRecord: typeof event | null = event;
let currentEmail = "customer@example.test";
let customerStatus = "ACTIVE";
const db = {
  servicePublicKey: {
    findUnique: async (args: { where: { keyId: string } }) => {
      if (lookupUnavailable) throw new Error("database unavailable");
      if (args.where.keyId !== key.keyId) return null;
      return {
        ...key,
        revokedAt: keyRevoked ? new Date() : null,
        notAfter: keyExpiresAt,
        principal: { ...principal, revokedAt: revoked ? new Date() : null },
      };
    },
  },
  outboxEvent: { findUnique: async () => eventRecord },
  parcel: {
    findUnique: async () => ({
      ...parcel,
      user: { email: currentEmail, status: customerStatus },
    }),
  },
} as unknown as Database;
const config = {
  SERVICE_ISSUER: "https://issuer.example.test",
  INTERNAL_PORT: 3001,
} as Config;
const app = createInternalApp({ db, config });
const tokenFor = (
  overrides: Partial<{
    eventId: string;
    parcelId: string;
    scope: string;
    serviceId: string;
    serviceKind: string;
    issuer: string;
    audience: string;
  }> = {},
) =>
  signServiceEventToken({
    privateKey,
    keyId: "notification-key-1",
    serviceId: overrides.serviceId ?? principal.serviceId,
    serviceKind: overrides.serviceKind ?? principal.serviceKind,
    issuer: overrides.issuer ?? config.SERVICE_ISSUER,
    audience: overrides.audience ?? principal.audience,
    scope: overrides.scope ?? "notifications:lookup",
    eventId: overrides.eventId ?? ids.event,
    parcelId: overrides.parcelId ?? ids.parcel,
  });

describe("internal notification lookup", () => {
  it("returns only the six current booking fields and permits repeat reads", async () => {
    const token = await tokenFor();
    for (let i = 0; i < 2; i++) {
      const response = await request(app)
        .get(`/internal/v1/notifications/events/${ids.event}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(Object.keys(response.body).sort()).toEqual([
        "customerEmail",
        "eventId",
        "parcelId",
        "recipientName",
        "recipientPhone",
        "trackingNumber",
      ]);
      expect(response.body.customerEmail).toBe("customer@example.test");
    }
    currentEmail = "new-contact@example.test";
    const updated = await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(updated.body.customerEmail).toBe("new-contact@example.test");
    currentEmail = "customer@example.test";
    customerStatus = "SUSPENDED";
    const suspendedCustomer = await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(suspendedCustomer.body.customerEmail).toBe("customer@example.test");
    customerStatus = "ACTIVE";
  });

  it("requires service bearer authentication and rejects missing scope", async () => {
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Cookie", "session=anything")
      .expect(401);
    const token = await tokenFor({ scope: "" });
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("binds signed event and parcel claims to the persisted event", async () => {
    const wrongEvent = await tokenFor({
      eventId: "33333333-3333-4333-8333-333333333333",
    });
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${wrongEvent}`)
      .expect(404);
    const forgedRelation = await tokenFor({
      parcelId: "44444444-4444-4444-8444-444444444444",
    });
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${forgedRelation}`)
      .expect(404);
    eventRecord = { ...event, eventType: "parcel.status" };
    const token = await tokenFor();
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    eventRecord = event;
  });

  it("applies revocation on the next request across two app instances", async () => {
    const secondApp = createInternalApp({ db, config });
    const token = await tokenFor();
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    revoked = true;
    await request(secondApp)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    revoked = false;
    keyRevoked = true;
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    keyRevoked = false;
  });

  it("maps malformed paths to 400 and unavailable records to 404", async () => {
    const token = await tokenFor();
    await request(app)
      .get("/internal/v1/notifications/events/not-an-id")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    eventRecord = null;
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    eventRecord = event;
  });

  it("rejects a human-signed token despite a valid RSA signature", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: key.keyId })
      .setSubject("1")
      .setIssuer(config.SERVICE_ISSUER)
      .setAudience(principal.audience)
      .setJti("55555555-5555-4555-8555-555555555555")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(await importPKCS8(privateKey, "RS256"));
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("rejects invalid signature, audience, issuer, service kind and principal crossover", async () => {
    const valid = await tokenFor();
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${valid.slice(0, -2)}xx`)
      .expect(401);
    for (const overrides of [
      { audience: "wrong-audience" },
      { issuer: "https://wrong-issuer.example.test" },
      { serviceKind: "webhook" },
      { serviceId: "webhook-svc" },
      { scope: "notifications:lookup webhooks:config" },
    ]) {
      const token = await tokenFor(overrides);
      await request(app)
        .get(`/internal/v1/notifications/events/${ids.event}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    }
  });

  it("enforces expiry and rejects token-supplied key URLs", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({
      kid: key.keyId,
      serviceKind: principal.serviceKind,
      eventId: ids.event,
      parcelId: ids.parcel,
      scope: "notifications:lookup",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: key.keyId })
      .setSubject(principal.serviceId)
      .setIssuer(config.SERVICE_ISSUER)
      .setAudience(principal.audience)
      .setJti("66666666-6666-4666-8666-666666666666")
      .setIssuedAt(now - 400)
      .setExpirationTime(now - 100)
      .sign(await importPKCS8(privateKey, "RS256"));
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${expired}`)
      .expect(401);

    const remoteKey = await new SignJWT({
      kid: "unknown-key",
      serviceKind: principal.serviceKind,
      eventId: ids.event,
      parcelId: ids.parcel,
      scope: "notifications:lookup",
    })
      .setProtectedHeader({
        alg: "RS256",
        typ: "JWT",
        kid: "unknown-key",
        jku: "https://attacker.invalid/keys",
      })
      .setSubject(principal.serviceId)
      .setIssuer(config.SERVICE_ISSUER)
      .setAudience(principal.audience)
      .setJti("77777777-7777-4777-8777-777777777777")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(await importPKCS8(privateKey, "RS256"));
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${remoteKey}`)
      .expect(401);
  });

  it("rejects an unknown key ID", async () => {
    const token = await new SignJWT({
      kid: "unknown-key",
      serviceKind: principal.serviceKind,
      eventId: ids.event,
      parcelId: ids.parcel,
      scope: "notifications:lookup",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "unknown-key" })
      .setSubject(principal.serviceId)
      .setIssuer(config.SERVICE_ISSUER)
      .setAudience(principal.audience)
      .setJti("88888888-8888-4888-8888-888888888888")
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(await importPKCS8(privateKey, "RS256"));
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("rejects reuse of a configured human authentication key", async () => {
    const humanKeyApp = createInternalApp({
      db,
      config: { ...config, publicKeys: { human: publicKeyPem } } as Config,
    });
    const token = await tokenFor();
    await request(humanKeyApp)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("rejects retired or revoked keys and fails closed when the database is unavailable", async () => {
    const token = await tokenFor();
    keyExpiresAt = new Date(Date.now() - 1);
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    keyExpiresAt = null;
    keyRevoked = true;
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    keyRevoked = false;
    lookupUnavailable = true;
    await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(503);
    lookupUnavailable = false;
  });

  it("expires an old rotation key at the exact not-after instant", async () => {
    const deadline = new Date(Date.now() + 2_000);
    let currentTime = new Date(deadline.getTime() - 1);
    keyExpiresAt = deadline;
    const clockApp = createInternalApp({
      db,
      config,
      clock: () => currentTime,
    });
    const token = await tokenFor();
    await request(clockApp)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    currentTime = deadline;
    await request(clockApp)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    keyExpiresAt = null;
  });
});
