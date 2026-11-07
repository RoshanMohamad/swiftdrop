import { z } from "zod";
import { createDatabase } from "@swiftdrop/db";
import {
  createConfirmedPublisher,
  createLogger,
  declareTopology,
  loadWorkspaceEnv,
  onShutdown,
  runWithBroker,
  startHealthServer,
} from "@swiftdrop/messaging";
import { DEFAULT_BATCH_SIZE, publishBatch } from "./relay.js";

const env = z
  .object({
    DATABASE_URL: z.url(),
    RABBITMQ_URL: z.url().default("amqp://guest:guest@localhost:5672"),
    OUTBOX_RELAY_PORT: z.coerce.number().int().min(1).max(65535).default(3101),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .parse(loadWorkspaceEnv());
if (
  env.NODE_ENV === "production" &&
  env.RABBITMQ_URL === "amqp://guest:guest@localhost:5672"
)
  throw new Error("Production requires a dedicated RabbitMQ credential.");

const logger = createLogger("outbox-relay");
const db = createDatabase(env.DATABASE_URL);
const state = { connected: false, lastPollOk: false };
const abort = new AbortController();
const stopped = new Promise<void>((resolve) =>
  abort.signal.addEventListener("abort", () => resolve(), { once: true }),
);
const wait = (ms: number, until: Promise<unknown>) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void until.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });

const health = await startHealthServer({
  port: env.OUTBOX_RELAY_PORT,
  ready: () => state.connected && state.lastPollOk,
});
logger.info({ event: "started", healthPort: env.OUTBOX_RELAY_PORT });

const loop = runWithBroker({
  url: env.RABBITMQ_URL,
  logger,
  signal: abort.signal,
  onState: (connected) => {
    state.connected = connected;
    if (!connected) state.lastPollOk = false;
  },
  async session(connection, { closed, signal }) {
    const channel = await connection.createConfirmChannel();
    channel.on("error", (error: Error) =>
      logger.warn({ event: "channel_error", message: error.message }),
    );
    const channelClosed = new Promise<void>((resolve) =>
      channel.once("close", () => resolve()),
    );
    // Declared here so routing exists before the first publish; otherwise a mandatory publish
    // would be returned as unroutable and nothing could be marked published.
    await declareTopology(channel);
    const publisher = createConfirmedPublisher(channel);
    const ended = Promise.race([closed, channelClosed]);
    let open = true;
    void ended.then(() => {
      open = false;
    });
    while (open && !signal.aborted) {
      try {
        const result = await publishBatch(db, publisher, logger);
        state.lastPollOk = true;
        if (result.published)
          logger.info({ event: "outbox_published", ...result });
        // A full batch means a backlog: drain it without waiting for the next poll.
        if (result.claimed >= DEFAULT_BATCH_SIZE) continue;
      } catch (error) {
        state.lastPollOk = false;
        logger.error({
          event: "outbox_poll_failed",
          message: error instanceof Error ? error.message : "unknown",
        });
      }
      await wait(env.OUTBOX_POLL_INTERVAL_MS, Promise.race([ended, stopped]));
    }
    await channel.close().catch(() => undefined);
  },
});

onShutdown(async () => {
  abort.abort();
  await loop;
  await new Promise<void>((resolve) => health.close(() => resolve()));
  await db.$disconnect();
}, logger);
