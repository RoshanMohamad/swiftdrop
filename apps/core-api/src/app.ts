import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pino, { type Logger } from "pino";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Database } from "@swiftdrop/db";
import type { Redis } from "ioredis";
import type { Config } from "./shared/config.js";
import { errorHandler, HttpError } from "./shared/problem.js";
import { RateLimiter } from "./shared/rate-limit.js";
import {
  AuthService,
  authenticate,
  createAuthRouter,
} from "./modules/auth/index.js";
import type { TokenService } from "./modules/auth/jwt.js";
import type { AuthMailer } from "./modules/auth/mail.js";
import type { GoogleOidc } from "./modules/auth/google.js";
import { ParcelService } from "./modules/parcels/service.js";
import { createParcelRouter } from "./modules/parcels/routes.js";
import { UsersService, createUsersRouter } from "./modules/users/index.js";
import {
  WebhooksService,
  createWebhooksRouter,
} from "./modules/webhooks/index.js";
export function createApp(deps: {
  db: Database;
  redis: Redis;
  config: Config;
  tokens: TokenService;
  logger?: Logger;
  mailer?: AuthMailer;
  google?: GoogleOidc;
}) {
  const { db, redis, config, tokens } = deps;
  const logger =
    deps.logger ??
    pino({
      redact: {
        paths: [
          "password",
          "*.password",
          "authorization",
          "*.authorization",
          "cookie",
          "*.cookie",
          "token",
          "*.token",
          "email",
          "*.email",
          "phone",
          "*.phone",
        ],
        censor: "[REDACTED]",
      },
    });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));
  app.use((_req, res, next) => {
    res.locals.correlationId = randomUUID();
    res.setHeader("X-Correlation-ID", res.locals.correlationId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "8kb", strict: true }), cookieParser());
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/ready", async (_req, res) => {
    await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
    // Event publication is the outbox relay's job (apps/outbox-relay, own /readyz);
    // booking stays available while the broker is down because events wait in the outbox.
    res.json({ status: "ready" });
  });
  if (config.NODE_ENV !== "production") {
    app.get("/api/docs", (_req, res) =>
      res
        .type("html")
        .send(
          '<!doctype html><html lang="en"><title>SwiftDrop API</title><h1>SwiftDrop authentication API</h1><p><a href="/api/openapi.json">OpenAPI 3 contract</a></p><p>Use the web forms or import the contract into your API client. Mutations require same-origin JSON and X-CSRF-Token from GET /api/v1/auth/csrf.</p></html>',
        ),
    );
    app.get("/api/openapi.json", (_req, res) =>
      res
        .type("json")
        .send(
          readFileSync(
            `${config.root}/packages/contracts/openapi.json`,
            "utf8",
          ),
        ),
    );
  }
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
  app.get("/api/v1/auth/me", authenticate(service), (_req, res) =>
    res.json(res.locals.user),
  );
  app.use("/api/v1/auth", createAuthRouter(service, limiter, config, users));
  app.use("/api/v1/admin/users", createUsersRouter(users, service, config));
  app.use(
    "/api/v1/admin/webhook-deliveries",
    createWebhooksRouter(new WebhooksService(db), service, config),
  );
  const parcels = new ParcelService(db);
  app.use("/api/v1", createParcelRouter(parcels, service, limiter, config));
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "This route does not exist.")),
  );
  app.use(errorHandler(logger));
  return { app, service, users, limiter };
}
