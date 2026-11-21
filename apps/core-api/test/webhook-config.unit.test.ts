import { describe, it, expect } from "@jest/globals";
import { generateKeyPairSync } from "node:crypto";
import request from "supertest";
import type { Database } from "@swiftdrop/db";
import type { Config } from "../src/shared/config.js";
import { createInternalApp } from "../src/internal-app.js";
import { signServiceEventToken } from "../src/modules/services/signing.js";

const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  parcel: "22222222-2222-4222-8222-222222222222",
  merchant: "33333333-3333-4333-8333-333333333333",
  other: "44444444-4444-4444-8444-444444444444",
};
const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const privateKey = pair.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const publicKeyPem = pair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const principals = {
  webhook: {
    serviceId: "webhook-svc",
    serviceKind: "webhook",
    audience: "webhooks-test",
    permissions: ["webhooks:config"],
    revokedAt: null,
  },
  notification: {
    serviceId: "notification-svc",
    serviceKind: "notification",
    audience: "notifications-test",
    permissions: ["notifications:lookup"],
    revokedAt: null,
  },
};
const keyFor = (name: keyof typeof principals) => ({
  keyId: `${name}-key-1`,
  serviceId: principals[name].serviceId,
  publicKeyPem,
  notBefore: new Date(Date.now() - 60_000),
  notAfter: null,
  revokedAt: null,
  principal: principals[name],
});
const keys = new Map(
  (Object.keys(principals) as (keyof typeof principals)[]).map((name) => [
    keyFor(name).keyId,
    keyFor(name),
  ]),
);
const makeEvent = (merchantId: string | undefined, type = "parcel.created") => ({
  eventId: ids.event,
  eventType: type,
  aggregateId: ids.parcel,
  payload: {
    eventId: ids.event,
    type,
    version: 1,
    occurredAt: "2026-11-13T10:30:00.000Z",
    sequence: 1,
    data: {
      parcelId: ids.parcel,
      trackingNo: "SD1234567A",
      ...(merchantId ? { merchantId } : {}),
      ...(type === "parcel.status.changed"
        ? {
            from: "CREATED",
            to: "PICKED_UP",
            occurredAt: "2026-11-13T10:30:00.000Z",
          }
        : type === "parcel.created"
          ? {
              originZone: "Colombo",
              destZone: "Kandy",
              feeCents: 57000,
              scheduledDate: "2026-11-13T10:30:00.000Z",
            }
          : { newCourierId: "2" }),
    },
  },
});
let eventRecord: ReturnType<typeof makeEvent> | null = makeEvent(ids.merchant);
let target: { url: string; secret: string } | null = {
  url: "https://shop.example.test/hook",
  secret: "a-very-long-signing-secret-value",
};
const lookups: string[] = [];
const db = {
  servicePublicKey: {
    findUnique: async (args: { where: { keyId: string } }) =>
      keys.get(args.where.keyId) ?? null,
  },
  outboxEvent: { findUnique: async () => eventRecord },
} as unknown as Database;
const config = {
  SERVICE_ISSUER: "https://issuer.example.test",
  INTERNAL_PORT: 3001,
} as Config;
const app = createInternalApp({
  db,
  config,
  webhookTargetFor: async (merchantId) => {
    lookups.push(merchantId);
    return target;
  },
});
const tokenFor = (
  name: keyof typeof principals = "webhook",
  overrides: { eventId?: string; parcelId?: string; scope?: string } = {},
) =>
  signServiceEventToken({
    privateKey,
    keyId: `${name}-key-1`,
    serviceId: principals[name].serviceId,
    serviceKind: principals[name].serviceKind,
    issuer: config.SERVICE_ISSUER,
    audience: principals[name].audience,
    scope: overrides.scope ?? principals[name].permissions[0]!,
    eventId: overrides.eventId ?? ids.event,
    parcelId: overrides.parcelId ?? ids.parcel,
  });
const get = async (
  token: string | null,
  merchantId = ids.merchant,
  eventId = ids.event,
) => {
  const req = request(app).get(
    `/internal/v1/webhooks/merchants/${merchantId}/config?eventId=${eventId}`,
  );
  return token ? req.set("Authorization", `Bearer ${await token}`) : req;
};
const reset = () => {
  eventRecord = makeEvent(ids.merchant);
  target = {
    url: "https://shop.example.test/hook",
    secret: "a-very-long-signing-secret-value",
  };
  lookups.length = 0;
};

describe("internal webhook configuration lookup (X-11)", () => {
  it("returns exactly the URL and secret for the merchant that owns the event", async () => {
    reset();
    const res = await get(await tokenFor());
    expect(res.status).toBe(200);
    expect(res.body).toEqual(target);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(lookups).toEqual([ids.merchant]);
  });

  it("also serves status-change events", async () => {
    reset();
    eventRecord = makeEvent(ids.merchant, "parcel.status.changed");
    expect((await get(await tokenFor())).status).toBe(200);
  });

  it("requires a service token", async () => {
    reset();
    expect((await get(null)).status).toBe(401);
    expect((await get("garbage")).status).toBe(401);
    expect(lookups).toEqual([]);
  });

  it("denies the notification principal and a token signed without the scope", async () => {
    reset();
    expect((await get(await tokenFor("notification"))).status).toBe(403);
    expect(
      (await get(await tokenFor("webhook", { scope: "notifications:lookup" })))
        .status,
    ).toBe(401);
    expect(lookups).toEqual([]);
  });

  it("does not let the webhook principal use the notification lookup", async () => {
    reset();
    const res = await request(app)
      .get(`/internal/v1/notifications/events/${ids.event}`)
      .set("Authorization", `Bearer ${await tokenFor()}`);
    expect(res.status).toBe(403);
  });

  it("refuses a merchant that does not own the persisted event", async () => {
    reset();
    const res = await get(await tokenFor(), ids.other);
    expect(res.status).toBe(404);
    expect(lookups).toEqual([]);
  });

  it("refuses events without a merchant, of other types, or that are missing", async () => {
    reset();
    eventRecord = makeEvent(undefined);
    expect((await get(await tokenFor())).status).toBe(404);
    eventRecord = makeEvent(ids.merchant, "parcel.assignment.changed");
    expect((await get(await tokenFor())).status).toBe(404);
    eventRecord = null;
    expect((await get(await tokenFor())).status).toBe(404);
    expect(lookups).toEqual([]);
  });

  it("binds the signed event and parcel to the request", async () => {
    reset();
    const otherEvent = "55555555-5555-4555-8555-555555555555";
    expect(
      (await get(await tokenFor("webhook", { eventId: otherEvent }))).status,
    ).toBe(404);
    expect(
      (
        await get(
          await tokenFor("webhook", { parcelId: otherEvent }),
          ids.merchant,
        )
      ).status,
    ).toBe(404);
    expect(lookups).toEqual([]);
  });

  it("returns the same 404 for unconfigured, unapproved or suspended merchants", async () => {
    reset();
    target = null;
    const res = await get(await tokenFor());
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });

  it("maps malformed identifiers to 400", async () => {
    reset();
    expect((await get(await tokenFor(), "not-a-uuid")).status).toBe(400);
    expect((await get(await tokenFor(), ids.merchant, "nope")).status).toBe(
      400,
    );
    expect(lookups).toEqual([]);
  });

  it("is absent unless a target lookup is configured", async () => {
    const bare = createInternalApp({ db, config });
    const res = await request(bare)
      .get(
        `/internal/v1/webhooks/merchants/${ids.merchant}/config?eventId=${ids.event}`,
      )
      .set("Authorization", `Bearer ${await tokenFor()}`);
    expect(res.status).toBe(404);
  });
});
