import { Redis } from "ioredis";
import { createDatabase } from "@swiftdrop/db";
import { createApp } from "./app.js";
import { loadConfig } from "./shared/config.js";
import { createTokenService } from "./modules/auth/jwt.js";
import { createAuthMailer } from "./modules/auth/mail.js";
import pino from "pino";
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 3000,
});
redis.on("error", () => {
  /* request/readiness paths report safe failures */
});
const tokens = await createTokenService(config);
const logger = pino({
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
const { app } = createApp({
  db,
  redis,
  config,
  tokens,
  mailer: createAuthMailer(config.SMTP_URL),
  logger,
});
const server = app.listen(config.PORT, "127.0.0.1", () =>
  console.log(`SwiftDrop API listening at http://127.0.0.1:${config.PORT}`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  try {
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
    await db.$disconnect();
    redis.disconnect();
    clearTimeout(timeout);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
