/**
 * Singleton application logger for SwiftDrop core-api.
 *
 * This module exposes a pre-configured Pino logger that:
 *   - Redacts PII / credentials on all log paths (NFR-4).
 *   - Emits structured JSON in production and human-readable pretty output in
 *     development when the `LOG_PRETTY` env flag is set.
 *   - Provides a `childLogger` helper so request handlers can attach a
 *     `correlationId` to every log line without manual field injection.
 *
 * Import and use this everywhere inside `core-api`; do **not** create ad-hoc
 * `pino()` instances in module files — it defeats the redaction contract.
 *
 * @example
 * import { logger, childLogger } from '../shared/logger.js';
 *
 * // Module-level logger (no correlationId):
 * logger.info({ event: 'server_started', port: 3000 });
 *
 * // Request-scoped child (attaches correlationId automatically):
 * app.use((req, res, next) => {
 *   res.locals.log = childLogger(res.locals.correlationId);
 *   next();
 * });
 */

import pino, { type Logger } from "pino";

/** Paths whose values are replaced with `"[REDACTED]"` in every log line. */
const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "secret",
  "*.secret",
  "refreshToken",
  "*.refreshToken",
  "req.headers.authorization",
  "req.headers.cookie",
  "phone",
  "*.phone",
  "email",
  "*.email",
];

function buildLogger(): Logger {
  const pretty =
    process.env["NODE_ENV"] !== "production" &&
    process.env["LOG_PRETTY"] === "1";

  return pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
          },
        }
      : {}),
  });
}

/** Application-wide singleton logger — import this, do not call `pino()` directly. */
export const logger: Logger = buildLogger();

/**
 * Create a request-scoped child logger with the correlation ID pre-bound.
 * Use this inside Express middleware or route handlers:
 *
 * ```ts
 * const log = childLogger(res.locals.correlationId);
 * log.info({ event: 'parcel_created', parcelId });
 * ```
 */
export function childLogger(correlationId: string): Logger {
  return logger.child({ correlationId });
}

