import { describe, expect, it } from "@jest/globals";
import type { ConsumeMessage } from "amqplib";
import { ATTEMPT_HEADER, settle } from "../src/settle.js";

const QUEUE = "notifications.q";

function message(headers: Record<string, unknown> = {}): ConsumeMessage {
  return {
    content: Buffer.from('{"eventId":"e1"}'),
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: "",
      routingKey: QUEUE,
      consumerTag: "c",
    },
    properties: {
      contentType: "application/json",
      messageId: "e1",
      headers: { "x-correlation-id": "corr-1", ...headers },
    },
  } as unknown as ConsumeMessage;
}

function fakeChannel(options: { confirmFails?: boolean } = {}) {
  const log: string[] = [];
  const published: Array<{ queue: string; headers: Record<string, unknown> }> =
    [];
  const channel = {
    ack: () => void log.push("ack"),
    nack: (_m: unknown, _all?: boolean, requeue?: boolean) =>
      void log.push(requeue ? "nack-requeue" : "nack-dead-letter"),
    sendToQueue: (
      queue: string,
      _content: Buffer,
      publish?: { headers?: Record<string, unknown> },
    ) => {
      log.push("republish");
      published.push({ queue, headers: publish?.headers ?? {} });
      return true;
    },
    waitForConfirms: async () => {
      if (options.confirmFails) throw new Error("nacked by broker");
    },
    once: () => channel,
  };
  return { channel, log, published };
}

const opts = { queue: QUEUE, maxRetries: 3, delayMs: 0, sleep: async () => {} };

describe("settle (notifications.q retry limit)", () => {
  it("acks and dead-letters without republishing", async () => {
    const a = fakeChannel();
    await settle(a.channel, message(), "ack", opts);
    expect(a.log).toEqual(["ack"]);
    const r = fakeChannel();
    await settle(r.channel, message(), "reject", opts);
    expect(r.log).toEqual(["nack-dead-letter"]);
  });

  it("requeues a busy message without spending a retry", async () => {
    const { channel, log } = fakeChannel();
    await settle(channel, message({ [ATTEMPT_HEADER]: 3 }), "requeue", opts);
    expect(log).toEqual(["nack-requeue"]);
  });

  it("republishes a failed message with the next attempt, then acks the original", async () => {
    const { channel, log, published } = fakeChannel();
    await settle(channel, message(), "retry", opts);
    expect(log).toEqual(["republish", "ack"]);
    expect(published[0]).toEqual({
      queue: QUEUE,
      headers: { "x-correlation-id": "corr-1", [ATTEMPT_HEADER]: 1 },
    });
  });

  it("dead-letters after three redeliveries instead of looping forever", async () => {
    const attempts: number[] = [];
    let headers: Record<string, unknown> = {};
    for (let delivery = 0; delivery < 10; delivery += 1) {
      const { channel, log, published } = fakeChannel();
      await settle(channel, message(headers), "retry", opts);
      if (log.includes("nack-dead-letter")) break;
      headers = published[0]!.headers;
      attempts.push(headers[ATTEMPT_HEADER] as number);
    }
    expect(attempts).toEqual([1, 2, 3]);
  });

  it("keeps the original when the republish is not confirmed", async () => {
    const { channel, log } = fakeChannel({ confirmFails: true });
    await settle(channel, message(), "retry", opts);
    expect(log).toEqual(["republish", "nack-requeue"]);
  });
});
