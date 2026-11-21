import { describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import pino from "pino";
import {
  authenticateMerchantClient,
  requireMerchantScope,
} from "../src/modules/merchants/machine-auth.js";
import { OAuthProtocolError } from "../src/modules/merchants/oauth-error.js";
import { errorHandler } from "../src/shared/problem.js";
import type { MerchantsService } from "../src/modules/merchants/service.js";

/**
 * Authorisation rule (CLAUDE.md, Testing): a merchant token without `orders:write` cannot create
 * orders. This wires the real authenticate + requireMerchantScope middleware, in the same order as
 * POST /api/v1/merchant/orders, behind the real RFC 7807 error handler. The service is a fake that
 * maps a bearer string to a principal, so no database is needed.
 */
const principals: Record<string, string[]> = {
  "read-only": ["orders:read"],
  "write-only": ["orders:write"],
};
const merchants = {
  authenticateOAuthToken: async (token: string) => {
    const scopes = principals[token];
    if (!scopes) throw new OAuthProtocolError("invalid_token", 401, "bad token");
    return { kind: "merchant-client", clientId: "c1", merchantId: "m1", scopes };
  },
} as unknown as MerchantsService;

function app() {
  const a = express();
  a.post(
    "/api/v1/merchant/orders",
    authenticateMerchantClient(merchants),
    requireMerchantScope("orders:write"),
    (_req, res) => res.status(201).json({ trackingNo: "SD-TEST0001-1" }),
  );
  a.use(errorHandler(pino({ level: "silent" })));
  return a;
}

describe("POST /merchant/orders scope check", () => {
  it("returns 403 INSUFFICIENT_SCOPE for a token without orders:write", async () => {
    const res = await request(app())
      .post("/api/v1/merchant/orders")
      .set("Authorization", "Bearer read-only");
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain("INSUFFICIENT_SCOPE");
  });

  it("lets a token with orders:write through", async () => {
    const res = await request(app())
      .post("/api/v1/merchant/orders")
      .set("Authorization", "Bearer write-only");
    expect(res.status).toBe(201);
  });

  it("returns 401 without a valid bearer token", async () => {
    const none = await request(app()).post("/api/v1/merchant/orders");
    const bad = await request(app())
      .post("/api/v1/merchant/orders")
      .set("Authorization", "Bearer nope");
    expect(none.status).toBe(401);
    expect(bad.status).toBe(401);
  });
});
