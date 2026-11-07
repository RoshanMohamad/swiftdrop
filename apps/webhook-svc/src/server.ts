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
import {
  DevFileConfigSource,
  NoConfigSource,
  type WebhookConfigSource,
} from "./config-source.js";
import { consumeWebhooks, createHandoffPublisher } from "./consumer.js";
import { WebhookProcessor } from "./processor.js";
import { HttpWebhookSender } from "./sender.js";
import { PrismaDeliveryStore } from "./store.js";

const env = z
  .object({
    DATABASE_URL: z.url(),
    RABBITMQ_URL: z.url().default("amqp://guest:guest@localhost:5672"),
    WEBHOOK_SVC_PORT: z.coerce.number().int().min(1).max(65535).default(3102),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Development stand-ins. Refused in production (below).
    WEBHOOK_DEV_CONFIG_FILE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    WEBHOOK_DEV_ALLOWED_HOSTS: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
  })
  .parse(loadWorkspaceEnv());
const devHosts = (env.WEBHOOK_DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
if (
  env.NODE_ENV === "production" &&
  (env.WEBHOOK_DEV_CONFIG_FILE ||
    devHosts.length ||
    env.RABBITMQ_URL === "amqp://guest:guest@localhost:5672")
)
  throw new Error(
    "Production refuses development webhook settings and the default RabbitMQ credential.",
  );

const logger = createLogger("webhook-svc");
const db = createDatabase(env.DATABASE_URL);
const config: WebhookConfigSource = env.WEBHOOK_DEV_CONFIG_FILE
  ? new DevFileConfigSource(env.WEBHOOK_DEV_CONFIG_FILE)
  : new NoConfigSource();
if (!env.WEBHOOK_DEV_CONFIG_FILE)
  logger.warn({
    event: "webhook_config_source_missing",
    detail:
      "No merchant webhook configuration source is wired (plan X-11); deliveries are recorded as SKIPPED.",
  });
const sender = new HttpWebhookSender({ devAllowedHosts: devHosts });
const state = { connected: false };
const abort = new AbortController();

const health = await startHealthServer({
  port: env.WEBHOOK_SVC_PORT,
  ready: () => state.connected,
});
logger.info({ event: "started", healthPort: env.WEBHOOK_SVC_PORT });

const loop = runWithBroker({
  url: env.RABBITMQ_URL,
  logger,
  signal: abort.signal,
  onState: (connected) => {
    state.connected = connected;
  },
  async session(connection, { closed, signal }) {
    const quiet = (name: string) => (error: Error) =>
      logger.warn({ event: `${name}_error`, message: error.message });
    const handoffChannel = await connection.createConfirmChannel();
    handoffChannel.on("error", quiet("handoff_channel"));
    const consumeChannel = await connection.createChannel();
    consumeChannel.on("error", quiet("consume_channel"));
    await declareTopology(handoffChannel);
    const processor = new WebhookProcessor({
      store: new PrismaDeliveryStore(db),
      config,
      sender,
      handoff: createHandoffPublisher(createConfirmedPublisher(handoffChannel)),
      logger,
    });
    const consumer = await consumeWebhooks(consumeChannel, processor, logger);
    await Promise.race([
      closed,
      new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      ),
    ]);
    await consumer.stop();
    await consumeChannel.close().catch(() => undefined);
    await handoffChannel.close().catch(() => undefined);
  },
});

onShutdown(async () => {
  abort.abort();
  await loop;
  await new Promise<void>((resolve) => health.close(() => resolve()));
  await db.$disconnect();
}, logger);
