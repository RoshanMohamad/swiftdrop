import { describe, expect, it } from "@jest/globals";
import pino from "pino";
import type { SwiftDropEvent } from "@swiftdrop/contracts";
import { NotificationProcessor } from "../src/processor.js";
import { LookupError, type ContactLookup } from "../src/lookup.js";
import type { MessageSender } from "../src/senders.js";
import type { Claim, ProgressStore } from "../src/store.js";
import {
  escapeHtml,
  renderMessages,
  type Contact,
  type Message,
} from "../src/templates.js";
import { maskEmail, maskPhone } from "../src/mask.js";

const PARCEL = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const contact: Contact = {
  trackingNumber: "SD-ABCD1234-X",
  customerEmail: "customer@example.test",
  recipientName: "Kamal Perera",
  recipientPhone: "+94771234567",
};
const created: SwiftDropEvent = {
  eventId: EVENT,
  type: "parcel.created",
  version: 1,
  occurredAt: "2026-11-13T10:00:00.000Z",
  sequence: 1,
  data: {
    parcelId: PARCEL,
    trackingNo: contact.trackingNumber,
    originZone: "Colombo",
    destZone: "Kandy",
    feeCents: 57000,
    scheduledDate: "2026-11-13",
  },
};
const status = (
  to: "PICKED_UP" | "DELIVERED" | "IN_TRANSIT" | "FAILED",
): SwiftDropEvent => ({
  eventId: EVENT,
  type: "parcel.status.changed",
  version: 1,
  occurredAt: "2026-11-13T11:00:00.000Z",
  sequence: 3,
  data: {
    parcelId: PARCEL,
    trackingNo: contact.trackingNumber,
    from: "OUT_FOR_DELIVERY",
    to,
    town: "Kandy",
    occurredAt: "2026-11-13T11:00:00.000Z",
  },
});

describe("templates (FR-I3)", () => {
  it("renders a booking confirmation email and recipient SMS", () => {
    const messages = renderMessages(created, contact, "http://localhost:5173/");
    expect(messages.map((m) => [m.channel, m.templateId, m.to])).toEqual([
      ["EMAIL", "booking-confirmation", contact.customerEmail],
      ["SMS", "booking-recipient", contact.recipientPhone],
    ]);
    expect(messages[0]?.text).toContain(
      "http://localhost:5173/track/SD-ABCD1234-X",
    );
  });

  it("sends status emails always and SMS only for delivery milestones", () => {
    expect(
      renderMessages(status("PICKED_UP"), contact, "http://x.test").map(
        (m) => m.channel,
      ),
    ).toEqual(["EMAIL"]);
    expect(
      renderMessages(status("IN_TRANSIT"), contact, "http://x.test").map(
        (m) => m.channel,
      ),
    ).toEqual(["EMAIL"]);
    expect(
      renderMessages(status("DELIVERED"), contact, "http://x.test").map(
        (m) => m.channel,
      ),
    ).toEqual(["EMAIL", "SMS"]);
    expect(
      renderMessages(status("FAILED"), contact, "http://x.test").map(
        (m) => m.templateId,
      ),
    ).toEqual(["status-failed", "status-sms-failed"]);
  });

  it("never alerts on assignment events and escapes HTML", () => {
    const assigned: SwiftDropEvent = {
      eventId: EVENT,
      type: "parcel.assignment.changed",
      version: 1,
      occurredAt: "2026-11-13T11:00:00.000Z",
      sequence: 2,
      data: {
        parcelId: PARCEL,
        trackingNo: contact.trackingNumber,
        newCourierId: "9",
      },
    };
    expect(renderMessages(assigned, contact, "http://x.test")).toEqual([]);
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe(
      "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;",
    );
    const [email] = renderMessages(
      {
        ...status("DELIVERED"),
        data: { ...status("DELIVERED").data, town: "<script>x</script>" },
      } as SwiftDropEvent,
      contact,
      "http://x.test",
    );
    expect(email?.html).not.toContain("<script>");
  });

  it("masks recipients", () => {
    expect(maskEmail("customer@example.test")).toBe("c***@example.test");
    expect(maskPhone("+94771234567")).toBe("+94*****4567");
    expect(maskEmail("nonsense")).toBe("***");
  });
});

function harness(
  options: {
    claim?: Claim;
    lookup?: ContactLookup;
    failChannel?: "EMAIL" | "SMS";
    logs?: string[];
  } = {},
) {
  const sentLog = new Set<string>();
  const key = (e: string, m: Message) => `${e}|${m.channel}|${m.templateId}`;
  const calls = { claim: 0, complete: 0, release: 0 };
  const store: ProgressStore = {
    claim: async () => {
      calls.claim += 1;
      return options.claim ?? "claimed";
    },
    complete: async () => void (calls.complete += 1),
    release: async () => void (calls.release += 1),
    alreadySent: async (e, m) => sentLog.has(key(e, m)),
    record: async (e, m, outcome) => {
      if (outcome.status === "SENT") sentLog.add(key(e, m));
    },
  };
  const sent: Message[] = [];
  let failing = options.failChannel;
  const sender: MessageSender = {
    send: async (message) => {
      if (failing === message.channel) throw new Error("smtp down");
      sent.push(message);
      return { providerMessageId: "id" };
    },
  };
  const lookup: ContactLookup = options.lookup ?? {
    fetch: async () => contact,
  };
  const processor = new NotificationProcessor({
    store,
    lookup,
    sender,
    appOrigin: "http://localhost:5173",
    logger: options.logs
      ? pino(
          { level: "info" },
          { write: (chunk: string) => void options.logs!.push(chunk) },
        )
      : pino({ level: "silent" }),
  });
  return { processor, sent, calls, heal: () => void (failing = undefined) };
}
const body = (event: unknown) => Buffer.from(JSON.stringify(event));

describe("NotificationProcessor (FR-I3)", () => {
  it("sends the templates once and records completion", async () => {
    const { processor, sent, calls } = harness();
    expect(await processor.handle(body(created))).toBe("ack");
    expect(sent).toHaveLength(2);
    expect(calls).toMatchObject({ claim: 1, complete: 1, release: 0 });
  });

  it("suppresses a redelivered event that already completed", async () => {
    const { processor, sent } = harness({ claim: "done" });
    expect(await processor.handle(body(created))).toBe("ack");
    expect(sent).toHaveLength(0);
  });

  it("requeues while another worker holds the lease", async () => {
    const { processor, sent } = harness({ claim: "busy" });
    expect(await processor.handle(body(created))).toBe("requeue");
    expect(sent).toHaveLength(0);
  });

  it("rejects malformed and unknown messages without touching progress", async () => {
    const { processor, calls } = harness();
    expect(await processor.handle(Buffer.from("not json"))).toBe("reject");
    expect(
      await processor.handle(body({ eventId: "x", type: "parcel.created" })),
    ).toBe("reject");
    expect(calls.claim).toBe(0);
  });

  it("acknowledges assignment events without a claim or any message", async () => {
    const { processor, sent, calls } = harness();
    const assigned = {
      eventId: EVENT,
      type: "parcel.assignment.changed",
      version: 1,
      occurredAt: "2026-11-13T11:00:00.000Z",
      sequence: 2,
      data: {
        parcelId: PARCEL,
        trackingNo: contact.trackingNumber,
        newCourierId: "9",
      },
    };
    expect(await processor.handle(body(assigned))).toBe("ack");
    expect(sent).toHaveLength(0);
    expect(calls.claim).toBe(0);
  });

  it("rejects when no contact data exists and requeues when the lookup is unavailable", async () => {
    const missing = harness({
      lookup: {
        fetch: async () => {
          throw new LookupError("not_found", "gone");
        },
      },
    });
    expect(await missing.processor.handle(body(created))).toBe("reject");
    expect(missing.calls.release).toBe(1);
    const down = harness({
      lookup: {
        fetch: async () => {
          throw new LookupError("transient", "down");
        },
      },
    });
    expect(await down.processor.handle(body(created))).toBe("requeue");
    expect(down.calls.release).toBe(1);
    expect(down.calls.complete).toBe(0);
  });

  it("retries only the message that failed", async () => {
    const run = harness({ failChannel: "SMS" });
    expect(await run.processor.handle(body(created))).toBe("requeue");
    expect(run.sent.map((m) => m.channel)).toEqual(["EMAIL"]);
    expect(run.calls.release).toBe(1);
    run.heal();
    expect(await run.processor.handle(body(created))).toBe("ack");
    expect(run.sent.map((m) => m.channel)).toEqual(["EMAIL", "SMS"]); // email not sent twice
  });

  it("never logs contact details when a send fails", async () => {
    const logs: string[] = [];
    const { processor } = harness({ failChannel: "EMAIL", logs });
    expect(await processor.handle(body(created))).toBe("requeue");
    const output = logs.join("");
    expect(output).toContain("notification_send_failed");
    for (const secret of [
      contact.customerEmail,
      contact.recipientPhone,
      contact.recipientName,
    ])
      expect(output).not.toContain(secret);
  });
});
