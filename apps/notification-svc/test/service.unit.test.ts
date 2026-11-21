import { describe, expect, it, jest } from "@jest/globals";
import type {
  ParcelAssignedEvent,
  ParcelCreatedEvent,
  ParcelStatus,
  ParcelStatusChangedEvent,
} from "@swiftdrop/contracts";
import { maskEmail, maskPhone } from "../src/masking.js";
import { NotificationService } from "../src/service.js";
import { renderNotification } from "../src/templates.js";
import type {
  ContactLookupClient,
  EmailSender,
  NotificationProgress,
  SmsSender,
} from "../src/types.js";

const created: ParcelCreatedEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  type: "parcel.created",
  version: 1,
  occurredAt: "2026-11-13T10:30:00.000Z",
  sequence: 1,
  data: {
    parcelId: "22222222-2222-4222-8222-222222222222",
    trackingNo: "SD1234567A",
    customerId: "7",
    originZone: "Colombo",
    destZone: "Kandy",
    feeCents: 57000,
    scheduledDate: "2026-11-13T10:30:00.000Z",
  },
};
const changed: ParcelStatusChangedEvent = {
  ...created,
  type: "parcel.status.changed",
  sequence: 2,
  data: {
    parcelId: created.data.parcelId,
    trackingNo: created.data.trackingNo,
    from: "CREATED",
    to: "PICKED_UP",
    town: "Colombo",
    occurredAt: "2026-11-13T10:31:00.000Z",
  },
};
const assigned: ParcelAssignedEvent = {
  ...created,
  type: "parcel.assignment.changed",
  data: {
    parcelId: created.data.parcelId,
    trackingNo: created.data.trackingNo,
    newCourierId: "33333333-3333-4333-8333-333333333333",
  },
};
const recipient = {
  eventId: created.eventId,
  parcelId: created.data.parcelId,
  trackingNumber: created.data.trackingNo,
  customerEmail: "customer@example.test",
  recipientName: "Private Recipient",
  recipientPhone: "+94771234567",
};

function harness(options?: {
  acquire?: "acquired" | "done" | "busy";
  failEmail?: boolean;
  missingContact?: boolean;
}) {
  const records: Array<Record<string, unknown>> = [];
  const progress: NotificationProgress = {
    acquire: jest.fn(async () => options?.acquire ?? "acquired"),
    wasSent: jest.fn(async () => false),
    record: jest.fn(
      async (value: Parameters<NotificationProgress["record"]>[0]) =>
        void records.push(value),
    ),
    complete: jest.fn(async () => undefined),
    fail: jest.fn(async () => 2),
  };
  const lookup: ContactLookupClient = {
    lookup: jest.fn(async () => {
      if (options?.missingContact) throw new Error("contact unavailable");
      return recipient;
    }),
  };
  const email: EmailSender = {
    send: jest.fn(async () => {
      if (options?.failEmail) throw new Error("provider included private data");
      return { providerMessageId: "smtp-1" };
    }),
  };
  const sms: SmsSender = {
    send: jest.fn(async () => ({ providerMessageId: "mock-1" })),
  };
  return {
    service: new NotificationService(progress, lookup, email, sms),
    progress,
    lookup,
    email,
    sms,
    records,
  };
}

describe("notification templates and privacy", () => {
  it("renders distinct booking and status templates", () => {
    expect(renderNotification(created, recipient)).toMatchObject({
      templateId: "booking_confirmation",
      subject: expect.stringContaining("SD1234567A"),
    });
    expect(
      renderNotification(changed, { ...recipient, eventId: changed.eventId }),
    ).toMatchObject({
      templateId: "status_update",
      emailBody: expect.stringContaining("Picked Up in Colombo"),
    });
  });

  it.each<ParcelStatus>([
    "CREATED",
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
  ])("renders the valid %s status", (status) => {
    expect(
      renderNotification(
        { ...changed, data: { ...changed.data, to: status } },
        recipient,
      ),
    ).toMatchObject({
      templateId: "status_update",
      emailBody: expect.stringContaining(
        status
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      ),
    });
  });

  it("masks stored recipient identifiers", () => {
    expect(maskEmail("customer@example.test")).toBe("c***@example.test");
    expect(maskPhone("+94771234567")).toBe("***4567");
  });
});

describe("NotificationService", () => {
  it("ignores assignment-only events without claiming or sending", async () => {
    const test = harness();

    await expect(test.service.process(assigned)).resolves.toBe("ignored");
    expect(test.progress.acquire).not.toHaveBeenCalled();
    expect(test.lookup.lookup).not.toHaveBeenCalled();
    expect(test.email.send).not.toHaveBeenCalled();
    expect(test.sms.send).not.toHaveBeenCalled();
  });

  it("sends each channel and stores only masked recipients", async () => {
    const test = harness();
    await expect(test.service.process(created)).resolves.toBe("completed");
    expect(test.email.send).toHaveBeenCalledTimes(1);
    expect(test.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: created.eventId,
        recipient: recipient.customerEmail,
        subject: expect.stringContaining(created.data.trackingNo),
        body: expect.stringContaining("booking is confirmed"),
      }),
    );
    expect(test.sms.send).toHaveBeenCalledTimes(1);
    expect(test.records).toEqual([
      expect.objectContaining({
        channel: "EMAIL",
        templateId: "booking_confirmation",
        recipientMasked: "c***@example.test",
        status: "SENT",
        providerMessageId: "smtp-1",
      }),
      expect.objectContaining({
        channel: "SMS",
        templateId: "booking_confirmation",
        recipientMasked: "***4567",
        status: "SENT",
        providerMessageId: "mock-1",
      }),
    ]);
    expect(test.progress.complete).toHaveBeenCalledWith(created.eventId);
  });

  it("suppresses completed duplicates before lookup or send", async () => {
    const test = harness({ acquire: "done" });
    await expect(test.service.process(created)).resolves.toBe("done");
    expect(test.lookup.lookup).not.toHaveBeenCalled();
    expect(test.email.send).not.toHaveBeenCalled();
  });

  it("records a generic failure and returns the durable attempt count", async () => {
    const test = harness({ failEmail: true });
    await expect(test.service.process(created)).rejects.toEqual(
      expect.objectContaining({ attempts: 2 }),
    );
    expect(test.sms.send).toHaveBeenCalledTimes(1);
    expect(test.records[0]).toEqual(
      expect.objectContaining({
        channel: "EMAIL",
        recipientMasked: "c***@example.test",
        errorMessage: "DELIVERY_FAILED",
      }),
    );
    expect(JSON.stringify(test.records)).not.toContain("Private Recipient");
    expect(JSON.stringify(test.records)).not.toContain("+94771234567");
  });

  it("records both channels as skipped when contact lookup is missing", async () => {
    const test = harness({ missingContact: true });

    await expect(test.service.process(created)).rejects.toEqual(
      expect.objectContaining({ attempts: 2 }),
    );
    expect(test.email.send).not.toHaveBeenCalled();
    expect(test.sms.send).not.toHaveBeenCalled();
    expect(test.records).toEqual([
      expect.objectContaining({
        channel: "EMAIL",
        templateId: "booking_confirmation",
        recipientMasked: "***unavailable",
        status: "SKIPPED",
        errorMessage: "CONTACT_LOOKUP_FAILED",
      }),
      expect.objectContaining({
        channel: "SMS",
        templateId: "booking_confirmation",
        recipientMasked: "***unavailable",
        status: "SKIPPED",
        errorMessage: "CONTACT_LOOKUP_FAILED",
      }),
    ]);
  });
});
