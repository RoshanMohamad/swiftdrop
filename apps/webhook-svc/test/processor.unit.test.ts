import { describe, expect, it } from "@jest/globals";
import pino from "pino";
import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "@swiftdrop/contracts";
import { RETRY_DELAYS_SECONDS } from "@swiftdrop/messaging";
import { UnsafeDestinationError } from "../src/destination.js";
import {
  WebhookProcessor,
  type Claim,
  type DeliveryRecord,
  type DeliveryStore,
  type HandoffMessage,
  type HandoffPublisher,
} from "../src/processor.js";
import type { SendResult, Sender } from "../src/sender.js";
import { HEADERS, verify } from "../src/signing.js";

const logger = pino({ enabled: false });
const secret = "k".repeat(32);

class MemoryStore implements DeliveryStore {
  deliveries = new Map<string, DeliveryRecord>();
  attempts = new Map<
    string,
    {
      id: string;
      key: string;
      state: "CLAIMED" | "DONE";
      leaseUntil: number;
      handoff: "NONE" | "RETRY" | "DLQ";
      confirmed: boolean;
      outcome?: string;
      errorCode?: string;
    }
  >();
  failConfirm = false;
  async ensureDelivery(input: Parameters<DeliveryStore["ensureDelivery"]>[0]) {
    const key = `${input.eventId}:${input.merchantId}`;
    let found = [...this.deliveries.values()].find(
      (d) => `${d.eventId}:${d.merchantId}` === key,
    );
    if (!found) {
      found = { id: randomUUID(), ...input, status: "PENDING", currentRun: 0 };
      this.deliveries.set(found.id, found);
    }
    return found;
  }
  async findDelivery(id: string) {
    return this.deliveries.get(id) ?? null;
  }
  async claimAttempt(
    i: Parameters<DeliveryStore["claimAttempt"]>[0],
  ): Promise<Claim> {
    const key = `${i.deliveryId}:${i.run}:${i.attempt}`;
    const existing = this.attempts.get(key);
    if (!existing) {
      const id = String(this.attempts.size + 1);
      this.attempts.set(key, {
        id,
        key,
        state: "CLAIMED",
        leaseUntil: i.now.getTime() + i.leaseMs,
        handoff: "NONE",
        confirmed: false,
      });
      return { kind: "claimed", attemptId: id };
    }
    if (existing.state === "DONE")
      return {
        kind: "done",
        attempt: {
          id: existing.id,
          handoff: existing.handoff,
          handoffConfirmed: existing.confirmed,
        },
      };
    if (i.takeover || existing.leaseUntil <= i.now.getTime())
      return { kind: "claimed", attemptId: existing.id };
    return { kind: "busy" };
  }
  async completeAttempt(i: Parameters<DeliveryStore["completeAttempt"]>[0]) {
    const attempt = [...this.attempts.values()].find(
      (a) => a.id === i.attemptId,
    )!;
    Object.assign(attempt, {
      state: "DONE",
      handoff: i.handoff,
      confirmed: i.handoff === "NONE",
      outcome: i.outcome,
      errorCode: i.errorCode,
    });
    this.deliveries.get(i.deliveryId)!.status = i.deliveryStatus;
  }
  async confirmHandoff(id: string) {
    if (this.failConfirm) throw new Error("db down");
    [...this.attempts.values()].find((a) => a.id === id)!.confirmed = true;
  }
}

class Harness {
  store = new MemoryStore();
  retries: Array<{ message: HandoffMessage; delay: number }> = [];
  dead: HandoffMessage[] = [];
  sends: Array<{ url: string; body: string; headers: Record<string, string> }> =
    [];
  handoffFails = false;
  results: Array<SendResult | Error> = [];
  target: { url: string; secret: string } | null | Error = {
    url: "https://merchant.example/hook",
    secret,
  };
  clock = new Date("2026-11-07T10:00:00Z");
  sender: Sender = {
    send: async (url, body, headers) => {
      this.sends.push({ url, body, headers });
      const next = this.results.shift() ?? {
        ok: true,
        statusCode: 200,
        latencyMs: 5,
      };
      if (next instanceof Error) throw next;
      return next;
    },
  };
  handoff: HandoffPublisher = {
    retry: async (message, delay) => {
      if (this.handoffFails) throw new Error("not confirmed");
      this.retries.push({ message, delay });
    },
    deadLetter: async (message) => {
      if (this.handoffFails) throw new Error("not confirmed");
      this.dead.push(message);
    },
  };
  processor = new WebhookProcessor({
    store: this.store,
    config: {
      get: async () => {
        if (this.target instanceof Error) throw this.target;
        return this.target;
      },
    },
    sender: this.sender,
    handoff: this.handoff,
    logger,
    now: () => this.clock,
  });
  event(overrides: Partial<EventEnvelope["data"]> = {}): EventEnvelope {
    return {
      eventId: randomUUID(),
      type: "parcel.status.changed",
      version: 1,
      occurredAt: this.clock.toISOString(),
      sequence: 2,
      data: {
        parcelId: randomUUID(),
        trackingNo: "SD-AAAAAAAA-1",
        merchantId: 7,
        to: "PICKED_UP",
        ...overrides,
      },
    };
  }
  message(
    envelope: EventEnvelope,
    extra: { attempt?: number; run?: number; redelivered?: boolean } = {},
  ) {
    return {
      content: Buffer.from(JSON.stringify(envelope)),
      attempt: extra.attempt ?? 0,
      run: extra.run ?? 0,
      redelivered: extra.redelivered ?? false,
    };
  }
  get delivery() {
    return [...this.store.deliveries.values()][0]!;
  }
}
const fail = (statusCode = 500): SendResult => ({
  ok: false,
  statusCode,
  errorCode: `HTTP_${statusCode}`,
  latencyMs: 4,
});

describe("WebhookProcessor (FR-I4, Design Doc §7.7)", () => {
  it("delivers a signed webhook, retaining the original eventId, and completes", async () => {
    const h = new Harness();
    const event = h.event();
    expect(await h.processor.handle(h.message(event))).toBe("ack");
    expect(h.delivery.status).toBe("SUCCESS");
    expect(h.sends).toHaveLength(1);
    const sent = h.sends[0]!;
    expect(JSON.parse(sent.body).eventId).toBe(event.eventId);
    expect(
      verify({
        secret,
        body: sent.body,
        timestamp: sent.headers[HEADERS.timestamp]!,
        signature: sent.headers[HEADERS.signature]!,
        now: h.clock,
      }),
    ).toBe(true);
    expect(h.retries).toHaveLength(0);
    expect(h.dead).toHaveLength(0);
  });

  it("ignores events without a merchant and unrelated event types", async () => {
    const h = new Harness();
    expect(
      await h.processor.handle(h.message(h.event({ merchantId: null }))),
    ).toBe("ack");
    expect(
      await h.processor.handle(
        h.message({ ...h.event(), type: "auth.mail.ready" }),
      ),
    ).toBe("ack");
    expect(h.sends).toHaveLength(0);
    expect(h.store.deliveries.size).toBe(0);
  });

  it("rejects poison messages without touching state", async () => {
    const h = new Harness();
    expect(
      await h.processor.handle({
        content: Buffer.from("nope"),
        attempt: 0,
        run: 0,
        redelivered: false,
      }),
    ).toBe("reject");
    expect(
      await h.processor.handle(
        h.message({ ...h.event(), version: 9 } as never),
      ),
    ).toBe("reject");
    expect(
      await h.processor.handle(
        h.message({ ...h.event(), data: { parcelId: "not-a-uuid" } }),
      ),
    ).toBe("reject");
    expect(h.store.deliveries.size).toBe(0);
  });

  it("walks the full ladder: attempt 0 then retries 1..6 with fixed waits, then DLQ", async () => {
    const h = new Harness();
    const event = h.event();
    h.results = Array.from({ length: 7 }, () => fail());
    for (let attempt = 0; attempt <= 6; attempt++) {
      expect(await h.processor.handle(h.message(event, { attempt }))).toBe(
        "ack",
      );
      h.clock = new Date(h.clock.getTime() + 60_000);
    }
    expect(h.sends).toHaveLength(7);
    expect(h.retries.map((r) => r.delay)).toEqual([...RETRY_DELAYS_SECONDS]);
    expect(h.retries.map((r) => r.message.attempt)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(h.dead).toHaveLength(1);
    expect(h.delivery.status).toBe("FAILED");
    // Every attempt re-signed with its own timestamp; the eventId never changed.
    expect(new Set(h.sends.map((s) => s.headers[HEADERS.timestamp])).size).toBe(
      7,
    );
    expect(new Set(h.sends.map((s) => s.headers[HEADERS.eventId]))).toEqual(
      new Set([event.eventId]),
    );
    expect(h.sends.map((s) => s.headers[HEADERS.attempt])).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("recovers on a later attempt and stops retrying", async () => {
    const h = new Harness();
    const event = h.event();
    h.results = [fail(503), { ok: true, statusCode: 200, latencyMs: 3 }];
    await h.processor.handle(h.message(event, { attempt: 0 }));
    expect(h.delivery.status).toBe("PENDING");
    await h.processor.handle(h.message(event, { attempt: 1 }));
    expect(h.delivery.status).toBe("SUCCESS");
    expect(h.retries).toHaveLength(1);
  });

  it("records SKIPPED when the merchant has no webhook configured", async () => {
    const h = new Harness();
    h.target = null;
    expect(await h.processor.handle(h.message(h.event()))).toBe("ack");
    expect(h.delivery.status).toBe("SKIPPED");
    expect(h.sends).toHaveLength(0);
    expect(h.retries).toHaveLength(0);
  });

  it("treats a config lookup failure as a retryable failure", async () => {
    const h = new Harness();
    h.target = new Error("lookup down");
    expect(await h.processor.handle(h.message(h.event()))).toBe("ack");
    expect(h.retries).toHaveLength(1);
    expect(h.delivery.status).toBe("PENDING");
    expect([...h.store.attempts.values()][0]!.errorCode).toBe(
      "CONFIG_UNAVAILABLE",
    );
  });

  it("parks an unsafe destination immediately without retrying", async () => {
    const h = new Harness();
    h.results = [new UnsafeDestinationError("UNSAFE_DESTINATION", "private")];
    expect(await h.processor.handle(h.message(h.event()))).toBe("ack");
    expect(h.delivery.status).toBe("FAILED");
    expect(h.dead).toHaveLength(1);
    expect(h.retries).toHaveLength(0);
    expect([...h.store.attempts.values()][0]!.errorCode).toBe(
      "UNSAFE_DESTINATION",
    );
  });

  it("leaves the message unacknowledged when the retry hand-off is not confirmed, then resumes without re-sending", async () => {
    const h = new Harness();
    const event = h.event();
    h.results = [fail()];
    h.handoffFails = true;
    expect(await h.processor.handle(h.message(event))).toBe("requeue");
    expect(h.sends).toHaveLength(1);
    expect(h.retries).toHaveLength(0);
    h.handoffFails = false;
    expect(
      await h.processor.handle(h.message(event, { redelivered: true })),
    ).toBe("ack");
    expect(h.sends).toHaveLength(1); // attempt counter not advanced, no second POST
    expect(h.retries).toHaveLength(1);
  });

  it("leaves the message unacknowledged when the hand-off was sent but its confirmation could not be saved", async () => {
    const h = new Harness();
    const event = h.event();
    h.results = [fail()];
    h.store.failConfirm = true;
    expect(await h.processor.handle(h.message(event))).toBe("requeue");
    h.store.failConfirm = false;
    expect(
      await h.processor.handle(h.message(event, { redelivered: true })),
    ).toBe("ack");
    // At-least-once: the retry may be published twice; the claim makes the second harmless.
    expect(h.retries.length).toBeGreaterThanOrEqual(1);
    expect(h.sends).toHaveLength(1);
  });

  it("acknowledges a duplicate of a completed attempt and of a live in-flight attempt", async () => {
    const h = new Harness();
    const event = h.event();
    await h.processor.handle(h.message(event));
    expect(await h.processor.handle(h.message(event))).toBe("ack");
    expect(h.sends).toHaveLength(1);

    const busy = new Harness();
    const second = busy.event();
    const delivery = await busy.store.ensureDelivery({
      eventId: second.eventId,
      merchantId: 7,
      eventType: second.type,
      envelope: second,
    });
    await busy.store.claimAttempt({
      deliveryId: delivery.id,
      run: 0,
      attempt: 0,
      takeover: false,
      now: busy.clock,
      leaseMs: 30_000,
    });
    expect(await busy.processor.handle(busy.message(second))).toBe("ack");
    expect(busy.sends).toHaveLength(0);
    // A redelivery means the earlier consumer is gone, so the claim is taken over.
    expect(
      await busy.processor.handle(busy.message(second, { redelivered: true })),
    ).toBe("ack");
    expect(busy.sends).toHaveLength(1);
  });

  it("requeues when the database fails", async () => {
    const h = new Harness();
    h.store.ensureDelivery = async () => {
      throw new Error("db down");
    };
    expect(await h.processor.handle(h.message(h.event()))).toBe("requeue");
  });

  describe("admin replay (FR-I5)", () => {
    async function failedDelivery(h: Harness) {
      const event = h.event();
      h.results = Array.from({ length: 7 }, () => fail());
      for (let attempt = 0; attempt <= 6; attempt++)
        await h.processor.handle(h.message(event, { attempt }));
      return event;
    }
    const replayEnvelope = (
      h: Harness,
      deliveryId: string,
      runNumber: number,
    ): EventEnvelope => ({
      eventId: randomUUID(),
      type: "webhook.replay.requested",
      version: 1,
      occurredAt: h.clock.toISOString(),
      sequence: runNumber,
      data: { deliveryId, runNumber },
    });

    it("starts a new run that re-sends the ORIGINAL event with its original eventId", async () => {
      const h = new Harness();
      const original = await failedDelivery(h);
      const sendsBefore = h.sends.length;
      h.delivery.currentRun = 1; // what the Admin API does in its transaction
      h.delivery.status = "PENDING";
      h.results = [{ ok: true, statusCode: 200, latencyMs: 2 }];
      const replay = replayEnvelope(h, h.delivery.id, 1);
      expect(await h.processor.handle(h.message(replay))).toBe("ack");
      expect(h.sends).toHaveLength(sendsBefore + 1);
      const sent = JSON.parse(h.sends.at(-1)!.body);
      expect(sent.eventId).toBe(original.eventId);
      expect(sent.type).toBe("parcel.status.changed");
      expect(h.sends.at(-1)!.headers[HEADERS.attempt]).toBe("0");
      expect(h.delivery.status).toBe("SUCCESS");
    });

    it("hands failed replay attempts back with the replay run so retries stay in that run", async () => {
      const h = new Harness();
      await failedDelivery(h);
      h.delivery.currentRun = 1;
      h.results = [fail()];
      await h.processor.handle(h.message(replayEnvelope(h, h.delivery.id, 1)));
      expect(h.retries.at(-1)!.message).toMatchObject({ attempt: 1, run: 1 });
    });

    it("acknowledges stale messages from a superseded run and rejects unknown deliveries", async () => {
      const h = new Harness();
      const original = await failedDelivery(h);
      h.delivery.currentRun = 1;
      const sends = h.sends.length;
      expect(
        await h.processor.handle(h.message(original, { attempt: 2, run: 0 })),
      ).toBe("ack");
      expect(h.sends).toHaveLength(sends);
      expect(
        await h.processor.handle(h.message(replayEnvelope(h, randomUUID(), 1))),
      ).toBe("reject");
    });
  });
});
