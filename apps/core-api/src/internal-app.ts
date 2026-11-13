import express from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import type { Database } from "@swiftdrop/db";
import type { Config } from "./shared/config.js";
import { errorHandler, HttpError } from "./shared/problem.js";
import { createServiceAuthenticator } from "./modules/services/auth.js";
import { createNotificationLookupRouter } from "./modules/services/notifications.js";

export function createInternalApp(deps: {
  db: Database;
  config: Config;
  logger?: Logger;
  clock?: () => Date;
}) {
  const app = express();
  const logger = deps.logger ?? pino();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));
  app.use((_req, res, next) => {
    res.locals.correlationId = randomUUID();
    res.setHeader("X-Correlation-ID", res.locals.correlationId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const authenticate = createServiceAuthenticator(
    deps.db,
    deps.config,
    deps.clock,
  );
  app.use(
    "/internal/v1/notifications",
    createNotificationLookupRouter(deps.db, authenticate),
  );
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "This route does not exist.")),
  );
  app.use(errorHandler(logger));
  return app;
}
