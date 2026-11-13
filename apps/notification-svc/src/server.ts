import { createServer } from "node:http";
import pino from "pino";
import { createDatabase } from "@swiftdrop/db";
import { loadNotificationConfig } from "./config.js";
import { ServiceJwtRecipientLookup } from "./lookup.js";
import { RabbitNotificationConsumer } from "./rabbit.js";
import { MockSmsSender, SmtpEmailSender } from "./senders.js";
import { NotificationService } from "./service.js";
import { PrismaNotificationProgress } from "./store.js";

const config = loadNotificationConfig();
const logger = pino({
  redact: {
    paths: ["email", "*.email", "phone", "*.phone", "recipient", "*.recipient"],
    censor: "[REDACTED]",
  },
});
const db = createDatabase(config.DATABASE_URL);
const service = new NotificationService(
  new PrismaNotificationProgress(db),
  new ServiceJwtRecipientLookup(
    config.INTERNAL_API_URL,
    config.signerMetadataFile,
  ),
  new SmtpEmailSender(config.SMTP_URL, config.NOTIFICATION_FROM),
  new MockSmsSender(),
);
const consumer = new RabbitNotificationConsumer(
  config.RABBITMQ_URL,
  service,
  logger,
).start();
const health = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (path === "/readyz") {
    response.writeHead(consumer.state.connected ? 200 : 503, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({
        status: consumer.state.connected ? "ready" : "not_ready",
        rabbitmq: consumer.state.connected,
      }),
    );
    return;
  }
  response.writeHead(404).end();
});
health.listen(config.NOTIFICATION_PORT, "127.0.0.1");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  try {
    await new Promise<void>((done, fail) =>
      health.close((error) => (error ? fail(error) : done())),
    );
    await consumer.stop();
    await db.$disconnect();
    clearTimeout(timeout);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
