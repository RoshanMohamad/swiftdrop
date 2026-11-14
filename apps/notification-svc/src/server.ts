import { z } from "zod";
import type { Channel, ConsumeMessage } from "amqplib";
import { createDatabase } from "@swiftdrop/db";
import {
  QUEUES,
  createLogger,
  declareTopology,
  loadWorkspaceEnv,
  onShutdown,
  runWithBroker,
  startHealthServer,
} from "@swiftdrop/messaging";
import { HttpContactLookup } from "./lookup.js";
import { NotificationProcessor, type Disposition } from "./processor.js";
import {
  MockSmsSender,
  SmtpEmailSender,
  createChannelSender,
} from "./senders.js";
import { PrismaProgressStore } from "./store.js";

const env = z
  .object({
    DATABASE_URL: z.url(),
    RABBITMQ_URL: z.url().default("amqp://guest:guest@localhost:5672"),
    SMTP_URL: z.string().default("smtp://localhost:1025"),
    CORE_INTERNAL_URL: z.url().default("http://127.0.0.1:3001"),
    APP_ORIGIN: z.url().default("http://localhost:5173"),
    NOTIFICATION_SVC_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(3103),
    NOTIFICATION_SIGNER_FILE: z
      .string()
      .default(".local/services/notification-svc/signer.json"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .parse(loadWorkspaceEnv());

if (
  env.NODE_ENV === "production" &&
  env.RABBITMQ_URL === "amqp://guest:guest@localhost:5672"
)
  throw new Error("Production refuses the default RabbitMQ credential.");

const logger = createLogger("notification-svc");
const db = createDatabase(env.DATABASE_URL);
const processor = new NotificationProcessor({
  store: new PrismaProgressStore(db),
  lookup: new HttpContactLookup({
    baseUrl: env.CORE_INTERNAL_URL,
    signerFile: env.NOTIFICATION_SIGNER_FILE,
  }),
  sender: createChannelSender({
    EMAIL: new SmtpEmailSender(env.SMTP_URL),
    SMS: new MockSmsSender(logger),
  }),
  appOrigin: env.APP_ORIGIN,
  logger,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let connected = false;
const abort = new AbortController();

async function consume(channel: Channel) {
  const inflight = new Set<Promise<void>>();
  await channel.prefetch(8);
  const { consumerTag } = await channel.consume(
    QUEUES.notifications,
    (message: ConsumeMessage | null) => {
      if (!message) return;
      const work = (async () => {
        const disposition: Disposition = await processor.handle(
          message.content,
        );
        try {
          if (disposition === "ack") channel.ack(message);
          // Poison goes to the DLQ through the queue's dead-letter policy.
          else if (disposition === "reject")
            channel.nack(message, false, false);
          else {
            await sleep(2000); // no hot loop while a dependency is down
            channel.nack(message, false, true);
          }
        } catch {
          /* channel closed: the broker redelivers the unacknowledged message */
        }
      })();
      inflight.add(work);
      void work.finally(() => inflight.delete(work));
    },
  );
  return async () => {
    await channel.cancel(consumerTag).catch(() => undefined);
    await Promise.allSettled([...inflight]);
  };
}

const broker = runWithBroker({
  url: env.RABBITMQ_URL,
  logger,
  signal: abort.signal,
  onState: (state) => {
    connected = state;
  },
  session: async (connection, { closed, signal }) => {
    const channel = await connection.createChannel();
    channel.on("error", () => undefined);
    await declareTopology(channel);
    const stop = await consume(channel);
    await Promise.race([
      closed,
      new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      ),
    ]);
    await stop();
  },
});

const health = await startHealthServer({
  port: env.NOTIFICATION_SVC_PORT,
  ready: async () => {
    await db.$queryRaw`SELECT 1`;
    return connected;
  },
});
logger.info({ event: "started", port: env.NOTIFICATION_SVC_PORT });

onShutdown(async () => {
  abort.abort();
  await broker;
  await new Promise<void>((resolve) => health.close(() => resolve()));
  await db.$disconnect();
}, logger);
