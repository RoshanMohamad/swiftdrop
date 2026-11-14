import { describe, expect, it, jest } from "@jest/globals";
import pino from "pino";
import { randomUUID } from "node:crypto";
import type { ConfirmedMessage } from "@swiftdrop/messaging";
import { QUARANTINED, publishBatch } from "../src/relay.js";

const logger = pino({ enabled: false });
const envelope = (type = "parcel.created") => {
  const eventId = randomUUID();
  return {
    eventId,
    type,
    version: 1,
    occurredAt: "2026-11-07T10:00:00.000Z",
    sequence: 1,
    data: { parcelId: randomUUID(), trackingNo: "SD-AAAAAAAA-1" },
  };
};
const row = (payload: unknown, id = randomUUID()) => {
  const p = payload as { eventId: string; type: string };
  return { id, event_id: p.eventId, event_type: p.type, payload };
};

function fakeDb(rows: ReturnType<typeof row>[]) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const tx = {
    $queryRaw: jest.fn(async () => rows),
    outboxEvent: {
      updateMany: jest.fn(async (args: (typeof updates)[number]) => {
        updates.push(args);
        return { count: 0 };
      }),
    },
  };
  return {
    updates,
    db: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    } as never,
  };
}

describe("publishBatch (FR-I1)", () => {
  it("publishes with the envelope's type as routing key and marks rows published", async () => {
    const events = [envelope(), envelope("parcel.status.changed")];
    const { db, updates } = fakeDb(events.map((e) => row(e)));
    const sent: ConfirmedMessage[] = [];
    const result = await publishBatch(
      db,
      { publish: async (m) => void sent.push(m) },
      logger,
    );
    expect(result).toMatchObject({ claimed: 2, published: 2, failed: 0 });
    expect(sent.map((m) => m.routingKey)).toEqual([
      "parcel.created",
      "parcel.status.changed",
    ]);
    expect(sent.map((m) => m.messageId)).toEqual(events.map((e) => e.eventId));
    expect(sent[0]!.exchange).toBe("swiftdrop.events");
    expect(JSON.parse(sent[0]!.content.toString())).toEqual(events[0]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data).toMatchObject({ attempts: { increment: 1 } });
  });

  it("marks only the confirmed prefix so a failure never lets later events overtake", async () => {
    const events = [envelope(), envelope(), envelope()];
    const { db, updates } = fakeDb(events.map((e) => row(e)));
    let call = 0;
    const result = await publishBatch(
      db,
      {
        publish: async () => {
          if (++call === 2) throw new Error("nacked");
        },
      },
      logger,
    );
    expect(result).toMatchObject({ published: 1, failed: 2 });
    const marked = (updates[0]!.where as { id: { in: string[] } }).id.in;
    expect(marked).toHaveLength(1);
  });

  it("marks nothing when the broker is unavailable, so events are retried later", async () => {
    const { db, updates } = fakeDb([row(envelope())]);
    const result = await publishBatch(
      db,
      {
        publish: async () => {
          throw new Error("unroutable");
        },
      },
      logger,
    );
    expect(result).toMatchObject({ published: 0, failed: 1 });
    expect(updates).toHaveLength(0);
  });

  it("quarantines malformed or mismatched rows without blocking valid ones", async () => {
    const good = envelope();
    const mismatched = { ...envelope(), type: "parcel.other" };
    const leaky = envelope();
    const rows = [
      row({
        eventId: randomUUID(),
        eventType: "parcel.created",
        parcelId: "legacy flat payload",
      }),
      { ...row(mismatched), event_type: "parcel.created" },
      row({
        ...leaky,
        data: { ...leaky.data, recipientPhone: "+94771234567" },
      }),
      row(good),
    ];
    const { db, updates } = fakeDb(rows);
    const sent: ConfirmedMessage[] = [];
    const result = await publishBatch(
      db,
      { publish: async (m) => void sent.push(m) },
      logger,
    );
    expect(result).toMatchObject({ published: 1, quarantined: 3 });
    expect(sent.map((m) => m.messageId)).toEqual([good.eventId]);
    const quarantine = updates.find((u) => u.data.attempts === QUARANTINED)!;
    expect((quarantine.where as { id: { in: string[] } }).id.in).toHaveLength(
      3,
    );
  });

  it("does nothing for an empty outbox", async () => {
    const { db, updates } = fakeDb([]);
    const publish = jest.fn(async () => undefined);
    expect(await publishBatch(db, { publish }, logger)).toMatchObject({
      claimed: 0,
    });
    expect(publish).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
