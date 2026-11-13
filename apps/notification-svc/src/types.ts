import type { SwiftDropEvent } from "@swiftdrop/contracts";

export type NotificationEvent = Extract<
  SwiftDropEvent,
  { type: "parcel.created" | "parcel.status.changed" }
>;
export type NotificationChannel = "EMAIL" | "SMS";

export interface NotificationRecipient {
  eventId: string;
  parcelId: string;
  trackingNumber: string;
  customerEmail: string;
  recipientName: string;
  recipientPhone: string;
}

export interface RecipientLookup {
  lookup(event: NotificationEvent): Promise<NotificationRecipient>;
}

export interface MessageSender {
  send(input: {
    recipient: string;
    subject?: string;
    body: string;
    eventId: string;
  }): Promise<{ providerMessageId?: string }>;
}

export interface NotificationProgress {
  acquire(eventId: string): Promise<"acquired" | "done" | "busy">;
  wasSent(eventId: string, channel: NotificationChannel): Promise<boolean>;
  record(input: {
    eventId: string;
    channel: NotificationChannel;
    templateId: string;
    recipientMasked: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    providerMessageId?: string;
    errorMessage?: string;
  }): Promise<void>;
  complete(eventId: string): Promise<void>;
  fail(eventId: string): Promise<number>;
}
