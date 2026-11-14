import type { Channel } from "amqplib";
import { WEBHOOK_REPLAY_EVENT } from "@swiftdrop/contracts";

/**
 * RabbitMQ topology (Design Doc §6.2, §6.4, Table 9, §7.7). The single source of truth:
 * relay, webhook dispatcher and future consumers import these names; nobody hard-codes them.
 *
 * Queue arguments cannot change on a live queue. Changing anything here is a breaking
 * infrastructure change: delete the old queue/exchange or reset the broker volume first.
 */
export const EXCHANGES = {
  /** Topic exchange written by the outbox relay. */
  events: "swiftdrop.events",
  /** Direct exchange the webhook dispatcher publishes retry hand-offs to. */
  webhookRetry: "swiftdrop.webhooks.retry",
  /** Dedicated direct return exchange: retry-queue dead letters route only to webhooks.q. */
  webhookReturn: "swiftdrop.webhooks.return",
  /** Direct exchange for confirmed dead-letter hand-offs. */
  dead: "swiftdrop.dead",
} as const;

export const QUEUES = {
  realtime: "realtime.q",
  notifications: "notifications.q",
  notificationsDlq: "notifications.dlq",
  webhooks: "webhooks.q",
  webhooksDlq: "webhooks.dlq",
} as const;

/** Fixed waits after failed attempts 0..5 (attempt 6 failing goes to the DLQ). 31.5 min total. */
export const RETRY_DELAYS_SECONDS = [30, 60, 120, 240, 480, 960] as const;
/** Highest attempt number: initial attempt 0 plus retries 1..6 (seven HTTP attempts). */
export const MAX_WEBHOOK_ATTEMPT = RETRY_DELAYS_SECONDS.length;

export const retryQueueName = (seconds: number) =>
  `webhooks.retry.${seconds}.q`;
export const retryRoutingKey = (seconds: number) => `retry.${seconds}`;
/** Routing keys inside the direct exchanges. */
export const ROUTE = {
  webhooksReturn: "webhooks",
  deadWebhooks: "webhooks",
  deadNotifications: "notifications",
} as const;
export const DLQ_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const REALTIME_TTL_MS = 60_000;
export const NOTIFICATION_REDELIVERIES = 3;

export type QueueDefinition = {
  name: string;
  arguments: Record<string, string | number>;
  bindings: Array<{ exchange: string; key: string }>;
};
export type TopologyDefinition = {
  exchanges: Array<{ name: string; type: "topic" | "direct" }>;
  queues: QueueDefinition[];
};

export type TopologyOptions = {
  /** Test seam only: shrink retry waits so integration tests need not wait 31 minutes. */
  retryDelayMs?: (seconds: number) => number;
};

const quorum = {
  "x-queue-type": "quorum",
  // Dead-lettering from quorum queues is at-least-once only with this pair (RabbitMQ 4).
  "x-dead-letter-strategy": "at-least-once",
  "x-overflow": "reject-publish",
} as const;

export function buildTopology(
  options: TopologyOptions = {},
): TopologyDefinition {
  const delay = options.retryDelayMs ?? ((seconds: number) => seconds * 1000);
  return {
    exchanges: [
      { name: EXCHANGES.events, type: "topic" },
      { name: EXCHANGES.webhookRetry, type: "direct" },
      { name: EXCHANGES.webhookReturn, type: "direct" },
      { name: EXCHANGES.dead, type: "direct" },
    ],
    queues: [
      {
        name: QUEUES.realtime,
        // Recoverable by an authorised REST snapshot, so a short TTL beats a backlog.
        arguments: { "x-message-ttl": REALTIME_TTL_MS },
        bindings: [{ exchange: EXCHANGES.events, key: "parcel.#" }],
      },
      {
        name: QUEUES.notifications,
        arguments: {
          ...quorum,
          "x-delivery-limit": NOTIFICATION_REDELIVERIES,
          "x-dead-letter-exchange": EXCHANGES.dead,
          "x-dead-letter-routing-key": ROUTE.deadNotifications,
        },
        bindings: [
          { exchange: EXCHANGES.events, key: "parcel.created" },
          { exchange: EXCHANGES.events, key: "parcel.status.*" },
        ],
      },
      {
        name: QUEUES.notificationsDlq,
        arguments: { "x-queue-type": "quorum" },
        bindings: [{ exchange: EXCHANGES.dead, key: ROUTE.deadNotifications }],
      },
      {
        name: QUEUES.webhooks,
        arguments: {
          ...quorum,
          // Poison messages (rejected without requeue, or over the delivery limit) are parked.
          "x-dead-letter-exchange": EXCHANGES.dead,
          "x-dead-letter-routing-key": ROUTE.deadWebhooks,
        },
        bindings: [
          { exchange: EXCHANGES.events, key: "parcel.#" },
          // Admin replay requests travel through the outbox. This key matches neither
          // realtime.q nor notifications.q, so replays never fan out (plan §12.2 step 6).
          { exchange: EXCHANGES.events, key: WEBHOOK_REPLAY_EVENT },
          { exchange: EXCHANGES.webhookReturn, key: ROUTE.webhooksReturn },
        ],
      },
      ...RETRY_DELAYS_SECONDS.map((seconds): QueueDefinition => ({
        name: retryQueueName(seconds),
        arguments: {
          ...quorum,
          // One TTL per queue avoids head-of-line blocking from mixed per-message TTLs.
          "x-message-ttl": delay(seconds),
          "x-dead-letter-exchange": EXCHANGES.webhookReturn,
          "x-dead-letter-routing-key": ROUTE.webhooksReturn,
        },
        bindings: [
          { exchange: EXCHANGES.webhookRetry, key: retryRoutingKey(seconds) },
        ],
      })),
      {
        name: QUEUES.webhooksDlq,
        arguments: {
          "x-queue-type": "quorum",
          "x-message-ttl": DLQ_RETENTION_MS,
        },
        bindings: [{ exchange: EXCHANGES.dead, key: ROUTE.deadWebhooks }],
      },
    ],
  };
}

/** Idempotent. Every service calls it on connect, so nothing depends on start-up order. */
export async function declareTopology(
  channel: Channel,
  options: TopologyOptions = {},
) {
  const topology = buildTopology(options);
  for (const exchange of topology.exchanges)
    await channel.assertExchange(exchange.name, exchange.type, {
      durable: true,
    });
  for (const queue of topology.queues) {
    await channel.assertQueue(queue.name, {
      durable: true,
      arguments: queue.arguments,
    });
    for (const binding of queue.bindings)
      await channel.bindQueue(queue.name, binding.exchange, binding.key);
  }
}
