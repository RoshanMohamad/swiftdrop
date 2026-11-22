import type { ConfirmChannel, ConsumeMessage, Options } from "amqplib";
import type { Disposition } from "./processor.js";

/** Retries already made for this message; set on each republish. */
export const ATTEMPT_HEADER = "x-swiftdrop-notification-attempt";

export interface SettleOptions {
  queue: string;
  /** Retries before the message is rejected into the queue's dead-letter exchange. */
  maxRetries: number;
  /** Pause before a retry or requeue, so a dependency outage is not a hot loop. */
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

type SettleChannel = Pick<
  ConfirmChannel,
  "ack" | "nack" | "sendToQueue" | "waitForConfirms"
> & { once(event: "drain", listener: () => void): unknown };

export function retryAttempt(message: ConsumeMessage) {
  const value: unknown = message.properties.headers?.[ATTEMPT_HEADER];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function republishOptions(
  message: ConsumeMessage,
  attempt: number,
): Options.Publish {
  const p = message.properties;
  return {
    contentType: p.contentType,
    contentEncoding: p.contentEncoding,
    correlationId: p.correlationId,
    messageId: p.messageId,
    timestamp: p.timestamp,
    type: p.type,
    appId: p.appId,
    persistent: true,
    headers: { ...p.headers, [ATTEMPT_HEADER]: attempt },
  };
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Settle one `notifications.q` message.
 *
 * RabbitMQ 4 no longer counts an AMQP 0.9.1 `nack(requeue=true)` towards a quorum queue's
 * `x-delivery-limit`, so requeueing alone retries forever and never reaches the DLQ. A counted
 * retry therefore republishes the message with an attempt header (confirmed before the original
 * is acked, so it is never lost), and the final failure is rejected into `notifications.dlq`
 * through the queue's dead-letter policy.
 */
export async function settle(
  channel: SettleChannel,
  message: ConsumeMessage,
  disposition: Disposition,
  options: SettleOptions,
) {
  const sleep = options.sleep ?? defaultSleep;
  try {
    if (disposition === "ack") {
      channel.ack(message);
      return;
    }
    if (disposition === "reject") {
      channel.nack(message, false, false);
      return;
    }
    if (disposition === "requeue") {
      await sleep(options.delayMs);
      channel.nack(message, false, true);
      return;
    }
    const attempt = retryAttempt(message);
    if (attempt >= options.maxRetries) {
      channel.nack(message, false, false);
      return;
    }
    await sleep(options.delayMs);
    try {
      const flushed = channel.sendToQueue(
        options.queue,
        message.content,
        republishOptions(message, attempt + 1),
      );
      if (!flushed)
        await new Promise<void>((resolve) => channel.once("drain", resolve));
      await channel.waitForConfirms();
    } catch {
      // Republish not confirmed: put the original back rather than lose it.
      channel.nack(message, false, true);
      return;
    }
    channel.ack(message);
  } catch {
    /* channel closed: the broker redelivers the unacknowledged message */
  }
}
