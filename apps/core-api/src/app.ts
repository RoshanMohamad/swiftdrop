import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Logger } from "pino";
import { readFileSync } from "node:fs";
import type { Database } from "@swiftdrop/db";
import type { Redis } from "ioredis";
import type { Config } from "./shared/config.js";
import { errorHandler, HttpError } from "./shared/problem.js";
import { RateLimiter } from "./shared/rate-limit.js";
import { checkRelay } from "./shared/relay-health.js";
import { logger as defaultLogger } from "./shared/logger.js";
import { correlationMiddleware } from "./shared/correlation.js";
import {
  AuthService,
  authenticate,
  createAuthRouter,
} from "./modules/auth/index.js";
import type { TokenService } from "./modules/auth/jwt.js";
import type { AuthMailer } from "./modules/auth/mail.js";
import type { GoogleOidc } from "./modules/auth/google.js";
import { ParcelService, createParcelRouter } from "./modules/parcels/index.js";
import {
  PricingService,
  createPricingRouter,
} from "./modules/pricing/index.js";
import {
  ReportsService,
  createReportsRouter,
} from "./modules/reports/index.js";
import {
  LifecycleService,
  createLifecycleRouter,
} from "./modules/lifecycle/index.js";
import { UsersService, createUsersRouter } from "./modules/users/index.js";
import { createReceiptRouter } from "./modules/receipts/routes.js";
import type { ReceiptService } from "./modules/receipts/service.js";
import {
  AssistantService,
  createAssistantRouter,
} from "./modules/assistant/index.js";
import {
  MerchantsService,
  createMerchantsRouter,
} from "./modules/merchants/index.js";
import { createMerchantOAuthRouter } from "./modules/merchants/oauth-routes.js";
import {
  WebhooksService,
  createWebhooksRouter,
} from "./modules/webhooks/index.js";
import { DispatchService, createDispatchRouter } from "./modules/dispatch/index.js";
import {
  CourierService,
  MinioProofStorage,
  createCourierRouter,
  createProofUploadRouter,
  type ProofStorage,
} from "./modules/courier/index.js";
export function createApp(deps: {
  db: Database;
  redis: Redis;
  config: Config;
  tokens: TokenService;
  logger?: Logger;
  mailer?: AuthMailer;
  google?: GoogleOidc;
  workerState?: { connected: boolean };
  receipts?: ReceiptService;
  proofStorage?: ProofStorage;
}) {
  const { db, redis, config, tokens } = deps;
  const logger = deps.logger ?? defaultLogger;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY > 0 ? config.TRUST_PROXY : false);
  app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));
  app.use(correlationMiddleware(logger));
  const service = new AuthService(
    db,
    tokens,
    config,
    deps.mailer,
    deps.google,
    logger,
  );
  const users = new UsersService(db, config.APP_ORIGIN, deps.mailer);
  const limiter = new RateLimiter(redis, config.rateSecret);
  const pricing = new PricingService(db);
  const parcels = new ParcelService(db, pricing);
  const merchants = new MerchantsService(db, tokens, config.oauthSecret);
  const lifecycle = new LifecycleService(db);
  const courier = new CourierService(
    db,
    lifecycle,
    deps.proofStorage ?? new MinioProofStorage(config),
  );
  // The OAuth token endpoint and the proof photo upload parse their own bodies, so they are
  // mounted before express.json.
  app.use(createMerchantOAuthRouter(merchants, limiter, logger));
  app.use(createProofUploadRouter(courier, service, limiter, config));
  app.use(express.json({ limit: "8kb", strict: true }), cookieParser());
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  // Liveness/readiness probe path used by Kubernetes and Docker (claude.md, Deployment).
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/ready", async (_req, res) => {
    await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
    // Event publication is the outbox relay's job (apps/outbox-relay, own /readyz). A stopped
    // relay silently stops every event, so readiness reports it; booking itself still works
    // because events wait in the outbox, but the instance must not look fully healthy.
    const relay = await checkRelay(config.OUTBOX_RELAY_URL);
    const ready = relay === "ready" || relay === "not-configured";
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      outboxRelay: relay,
    });
  });

  app.get("/api/docs", (_req, res) =>
    res
      .type("html")
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SwiftDrop API Reference</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #0f172a; color: #f8fafc; }
    .fallback { max-width: 800px; margin: 40px auto; padding: 24px; background: #1e293b; border-radius: 8px; border: 1px solid #334155; }
    h1 { color: #38bdf8; margin-top: 0; }
    a { color: #38bdf8; }
    .endpoint { margin: 12px 0; padding: 8px 12px; background: #0f172a; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <noscript>
    <div class="fallback">
      <h1>SwiftDrop API Documentation</h1>
      <p>Interactive API reference requires JavaScript.</p>
      <p><a href="/api/openapi.json">Download OpenAPI 3 Specification (JSON)</a></p>
    </div>
  </noscript>
</body>
</html>`),
  );

  app.get("/api/openapi.json", (_req, res) => {
    try {
      const contractPath = `${config.root}/packages/contracts/openapi.json`;
      res.type("json").send(readFileSync(contractPath, "utf8"));
    } catch {
      res.status(500).json({ status: 500, title: "OpenAPI contract not found" });
    }
  });
  app.get("/api/v1/auth/me", authenticate(service), (_req, res) =>
    res.json(res.locals.user),
  );
  app.use("/api/v1/auth", createAuthRouter(service, limiter, config, users));
  app.use("/api/v1/admin/users", createUsersRouter(users, service, config));
  app.use(
    "/api/v1/admin/webhook-deliveries",
    createWebhooksRouter(new WebhooksService(db), service, config),
  );
  app.use(
    "/api/v1",
    createMerchantsRouter(merchants, parcels, service, limiter, config),
  );
  app.use("/api/v1", createPricingRouter(pricing, service, limiter, config));
  const reports = new ReportsService(db);
  app.use("/api/v1", createReportsRouter(reports, service, limiter, config));
  app.use("/api/v1", createParcelRouter(parcels, service, limiter, config));
  app.use(
    "/api/v1",
    createLifecycleRouter(lifecycle, service, limiter, config),
  );
  app.use(
    "/api/v1",
    createDispatchRouter(new DispatchService(db), service, config),
  );
  app.use("/api/v1", createCourierRouter(courier, service, config));
  if (deps.receipts)
    app.use("/api/v1", createReceiptRouter(deps.receipts, service, config));
  const assistant = new AssistantService(db, pricing, parcels);
  app.use(
    "/api/v1",
    createAssistantRouter(assistant, service, limiter, config),
  );
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "This route does not exist.")),
  );
  app.use(errorHandler(logger));
  return { app, service, users, limiter, parcels };
}
