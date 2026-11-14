import pino, { type DestinationStream } from "pino";
import type { NotificationConfig } from "./config.js";

const REDACTED_PATHS = [
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
  "recipient",
  "*.recipient",
  "DATABASE_URL",
  "RABBITMQ_URL",
  "SMTP_URL",
];

export function createNotificationLogger(
  config: Pick<NotificationConfig, "NOTIFICATION_LOG_LEVEL">,
  destination?: DestinationStream,
) {
  return pino(
    {
      name: "notification-svc",
      level: config.NOTIFICATION_LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    },
    destination,
  );
}
