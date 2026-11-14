import { createDatabase } from "@swiftdrop/db";
import { createNotificationRuntime } from "./app.js";
import { loadNotificationConfig } from "./config.js";
import { createNotificationLogger } from "./logger.js";
import { RabbitMqEventConsumerSkeleton } from "./rabbit.js";

const config = loadNotificationConfig();
const logger = createNotificationLogger(config);
const database = createDatabase(config.DATABASE_URL);
const eventConsumer = new RabbitMqEventConsumerSkeleton(
  config.RABBITMQ_URL,
  logger,
);
const runtime = createNotificationRuntime({
  database,
  eventConsumer,
  logger,
  host: config.NOTIFICATION_HOST,
  port: config.NOTIFICATION_PORT,
  readinessTimeoutMs: config.NOTIFICATION_READINESS_TIMEOUT_MS,
});

let stopping = false;
async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Notification service stopping");
  const timeout = setTimeout(() => {
    logger.error("Notification service graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  timeout.unref();
  try {
    await runtime.stop();
    clearTimeout(timeout);
    logger.info("Notification service stopped");
    process.exitCode = 0;
  } catch {
    clearTimeout(timeout);
    logger.error(
      { error: "SHUTDOWN_FAILED" },
      "Notification service shutdown failed",
    );
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

runtime.start().catch(async (error: unknown) => {
  const code =
    error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  logger.fatal(
    {
      error: "STARTUP_FAILED",
      code: code ?? "UNKNOWN",
      host: config.NOTIFICATION_HOST,
      port: config.NOTIFICATION_PORT,
    },
    code === "EADDRINUSE"
      ? "Notification service address is already in use"
      : "Notification service failed",
  );
  await runtime.stop().catch(() => undefined);
  process.exitCode = 1;
});
