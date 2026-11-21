import type { Request, Response, NextFunction } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { CORRELATION_PATTERN } from "@swiftdrop/contracts";
import { childLogger } from "./logger.js";

const context = new AsyncLocalStorage<string>();

/**
 * The correlation id of the HTTP request currently being handled, if any. Lets code deep in a
 * transaction (the outbox writer) record it without threading it through every service.
 */
export const currentCorrelationId = () => context.getStore();

/**
 * Express middleware that extracts or generates a correlation ID,
 * sets the `X-Correlation-ID` response header, and attaches a child
 * logger pre-bound with the `correlationId` to `res.locals.logger` and `res.locals.log`.
 *
 * @param baseLogger Optional custom parent logger (defaults to singleton `logger`).
 */
export function correlationMiddleware(baseLogger?: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incomingHeader = req.headers["x-correlation-id"];
    const incoming = Array.isArray(incomingHeader) ? incomingHeader[0] : incomingHeader;

    // The header is untrusted and ends up in logs and broker headers: accept only a safe shape.
    const correlationId =
      typeof incoming === "string" && CORRELATION_PATTERN.test(incoming.trim())
        ? incoming.trim()
        : randomUUID();

    res.locals.correlationId = correlationId;

    const boundLogger = baseLogger
      ? baseLogger.child({ correlationId })
      : childLogger(correlationId);

    res.locals.logger = boundLogger;
    res.locals.log = boundLogger;

    res.setHeader("X-Correlation-ID", correlationId);
    res.setHeader("Cache-Control", "no-store");
    context.run(correlationId, next);
  };
}
