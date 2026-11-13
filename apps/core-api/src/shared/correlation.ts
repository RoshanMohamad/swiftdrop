import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { childLogger } from "./logger.js";

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

    const correlationId =
      typeof incoming === "string" && incoming.trim().length > 0
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
    next();
  };
}
