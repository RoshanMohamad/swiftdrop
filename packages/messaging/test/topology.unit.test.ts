import { describe, expect, it } from "@jest/globals";
import {
  EXCHANGES,
  MAX_WEBHOOK_ATTEMPT,
  QUEUES,
  RETRY_DELAYS_SECONDS,
  buildTopology,
  retryQueueName,
} from "../src/topology.js";

const topology = buildTopology();
const queue = (name: string) => topology.queues.find((q) => q.name === name)!;
const boundTo = (exchange: string, key: string) =>
  topology.queues
    .filter((q) =>
      q.bindings.some((b) => b.exchange === exchange && b.key === key),
    )
    .map((q) => q.name);

describe("topology (Design Doc Table 9)", () => {
  it("declares the events exchange as a durable topic and the others as direct", () => {
    expect(topology.exchanges).toEqual([
      { name: EXCHANGES.events, type: "topic" },
      { name: EXCHANGES.webhookRetry, type: "direct" },
      { name: EXCHANGES.webhookReturn, type: "direct" },
      { name: EXCHANGES.dead, type: "direct" },
    ]);
  });

  it("binds each consumer queue as specified", () => {
    expect(queue(QUEUES.realtime).bindings).toEqual([
      { exchange: EXCHANGES.events, key: "parcel.#" },
    ]);
    expect(queue(QUEUES.notifications).bindings.map((b) => b.key)).toEqual([
      "parcel.created",
      "parcel.status.*",
    ]);
    expect(
      queue(QUEUES.webhooks).bindings.filter(
        (b) => b.exchange === EXCHANGES.events,
      ),
    ).toEqual([
      { exchange: EXCHANGES.events, key: "parcel.#" },
      { exchange: EXCHANGES.events, key: "webhook.replay.requested" },
    ]);
  });

  it("never routes admin replay requests to realtime or notifications", () => {
    expect(boundTo(EXCHANGES.events, "webhook.replay.requested")).toEqual([
      QUEUES.webhooks,
    ]);
    expect(queue(QUEUES.realtime).bindings.map((b) => b.key)).not.toContain(
      "webhook.replay.requested",
    );
  });

  it("uses six fixed-delay retry queues whose waits total 31.5 minutes", () => {
    expect(RETRY_DELAYS_SECONDS).toEqual([30, 60, 120, 240, 480, 960]);
    expect(MAX_WEBHOOK_ATTEMPT).toBe(6);
    const total = RETRY_DELAYS_SECONDS.reduce((sum, s) => sum + s, 0);
    expect(total).toBe(1890);
    for (const seconds of RETRY_DELAYS_SECONDS) {
      const retry = queue(retryQueueName(seconds));
      expect(retry.arguments["x-message-ttl"]).toBe(seconds * 1000);
      expect(retry.arguments["x-queue-type"]).toBe("quorum");
      expect(retry.arguments["x-dead-letter-strategy"]).toBe("at-least-once");
      expect(retry.arguments["x-overflow"]).toBe("reject-publish");
      expect(retry.arguments["x-dead-letter-exchange"]).toBe(
        EXCHANGES.webhookReturn,
      );
    }
  });

  it("returns retried messages only to webhooks.q, never through the topic exchange", () => {
    expect(boundTo(EXCHANGES.webhookReturn, "webhooks")).toEqual([
      QUEUES.webhooks,
    ]);
    for (const q of topology.queues)
      expect(q.arguments["x-dead-letter-exchange"]).not.toBe(EXCHANGES.events);
  });

  it("keeps webhook dead letters for 14 days and retains no consumers' queues in the DLQ route", () => {
    expect(queue(QUEUES.webhooksDlq).arguments["x-message-ttl"]).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
    expect(boundTo(EXCHANGES.dead, "webhooks")).toEqual([QUEUES.webhooksDlq]);
    expect(boundTo(EXCHANGES.dead, "notifications")).toEqual([
      QUEUES.notificationsDlq,
    ]);
  });

  it("limits notification redeliveries to three then dead-letters", () => {
    const args = queue(QUEUES.notifications).arguments;
    expect(args["x-delivery-limit"]).toBe(3);
    expect(args["x-dead-letter-exchange"]).toBe(EXCHANGES.dead);
    expect(args["x-dead-letter-strategy"]).toBe("at-least-once");
  });

  it("applies a 60 second TTL to realtime.q", () => {
    expect(queue(QUEUES.realtime).arguments["x-message-ttl"]).toBe(60_000);
  });

  it("lets tests shrink retry waits without touching production defaults", () => {
    const fast = buildTopology({ retryDelayMs: () => 500 });
    expect(
      fast.queues.find((q) => q.name === retryQueueName(960))!.arguments[
        "x-message-ttl"
      ],
    ).toBe(500);
    expect(queue(retryQueueName(960)).arguments["x-message-ttl"]).toBe(960_000);
  });
});
