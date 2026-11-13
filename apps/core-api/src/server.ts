import { Redis } from "ioredis";
import { createServer } from "node:http";
import { createDatabase } from "@swiftdrop/db";
import { createApp } from "./app.js";
import { createInternalApp } from "./internal-app.js";
import { loadConfig } from "./shared/config.js";
import { createTokenService } from "./modules/auth/jwt.js";
import { createAuthMailer } from "./modules/auth/mail.js";
import pino from "pino";
import { startParcelEventWorkers } from "./modules/parcels/events.js";
import { ReceiptService } from "./modules/receipts/service.js";
import {
  createRealtimeGateway,
  startRealtimeConsumer,
} from "./modules/realtime/index.js";
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
const workerState = { connected: false };
const realtimeWorkerState = { connected: false };
const readinessState = {
  get connected() {
    return workerState.connected;
  },
  get realtimeConnected() {
    return realtimeWorkerState.connected;
  },
};
const { app, service } = createApp({
  db,
  redis,
  config,
  tokens,
  mailer: createAuthMailer(config.SMTP_URL),
  logger,
  workerState: readinessState,
  receipts: new ReceiptService(db, config),
});
const internalApp = createInternalApp({ db, config, logger });
const workers = startParcelEventWorkers(
  db,
  config.RABBITMQ_URL,
  logger,
  workerState,
  new ReceiptService(db, config),
);
const httpServer = createServer(app);
const realtime = await createRealtimeGateway({
  server: httpServer,
  db,
  redis,
  auth: service,
  origin: config.APP_ORIGIN,
  logger,
});
const realtimeConsumer = startRealtimeConsumer({
  url: config.RABBITMQ_URL,
  publish: realtime.publish,
  logger,
  state: realtimeWorkerState,
});
const server = httpServer.listen(config.PORT, "127.0.0.1", () =>
  console.log(`SwiftDrop API listening at http://127.0.0.1:${config.PORT}`),
);
const internalServer = internalApp.listen(
  config.INTERNAL_PORT,
  "127.0.0.1",
  () =>
    console.log(
      `SwiftDrop internal API listening at http://127.0.0.1:${config.INTERNAL_PORT}`,
    ),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  try {
    await realtimeConsumer.stop();
    await realtime.close();
    await Promise.all(
      [server, internalServer].map(
        (listener) =>
          new Promise<void>((done, fail) =>
            listener.close((error) =>
              error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
                ? fail(error)
                : done(),
            ),
          ),
      ),
    );
    await workers.stop();
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
