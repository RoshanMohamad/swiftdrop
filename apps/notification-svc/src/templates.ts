import type { ParcelStatus, SwiftDropEvent } from "@swiftdrop/contracts";

/** Contact data fetched through the X-03 lookup; never carried by events. */
export interface Contact {
  trackingNumber: string;
  customerEmail: string;
  recipientName: string;
  recipientPhone: string;
}

export interface Message {
  channel: "EMAIL" | "SMS";
  /** Stable id, part of the per-send idempotency key (event, channel, template). */
  templateId: string;
  to: string;
  subject?: string;
  text: string;
  html?: string;
}

const STATUS_COPY: Record<ParcelStatus, { subject: string; line: string }> = {
  CREATED: { subject: "booked", line: "has been booked" },
  PICKED_UP: { subject: "picked up", line: "has been picked up" },
  IN_TRANSIT: { subject: "in transit", line: "is on its way" },
  OUT_FOR_DELIVERY: {
    subject: "out for delivery",
    line: "is out for delivery today",
  },
  DELIVERED: { subject: "delivered", line: "has been delivered" },
  FAILED: {
    subject: "delivery attempt failed",
    line: "could not be delivered on this attempt",
  },
  CANCELLED: { subject: "cancelled", line: "has been cancelled" },
};
/** Recipient SMS only for the moments that need action or confirmation. */
const SMS_STATUSES: ReadonlySet<ParcelStatus> = new Set([
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
]);

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const trackUrl = (origin: string, trackingNumber: string) =>
  `${origin.replace(/\/$/, "")}/track/${encodeURIComponent(trackingNumber)}`;

const emailBody = (
  line: string,
  tracking: string,
  url: string,
  town?: string,
) => {
  const where = town ? ` Latest location: ${town}.` : "";
  const text = `Your parcel ${tracking} ${line}.${where}\n\nTrack it any time: ${url}\n\nSwiftDrop`;
  const html = `<p>Your parcel <strong>${escapeHtml(tracking)}</strong> ${escapeHtml(line)}.${escapeHtml(where)}</p><p><a href="${escapeHtml(url)}">Track your parcel</a></p><p>SwiftDrop</p>`;
  return { text, html };
};

/**
 * Booking confirmation (parcel.created) and status templates (parcel.status.changed). Every
 * other event type produces no messages, so assignment changes never alert customers.
 */
export function renderMessages(
  event: SwiftDropEvent,
  contact: Contact,
  appOrigin: string,
): Message[] {
  const url = trackUrl(appOrigin, contact.trackingNumber);
  if (event.type === "parcel.created") {
    const { text, html } = emailBody(
      "has been booked",
      contact.trackingNumber,
      url,
    );
    return [
      {
        channel: "EMAIL",
        templateId: "booking-confirmation",
        to: contact.customerEmail,
        subject: `Booking confirmed: ${contact.trackingNumber}`,
        text,
        html,
      },
      {
        channel: "SMS",
        templateId: "booking-recipient",
        to: contact.recipientPhone,
        text: `SwiftDrop: a parcel ${contact.trackingNumber} is being sent to you. Track: ${url}`,
      },
    ];
  }
  if (event.type === "parcel.status.changed") {
    const to = event.data.to;
    const copy = STATUS_COPY[to];
    const { text, html } = emailBody(
      copy.line,
      contact.trackingNumber,
      url,
      event.data.town,
    );
    const messages: Message[] = [
      {
        channel: "EMAIL",
        templateId: `status-${to.toLowerCase()}`,
        to: contact.customerEmail,
        subject: `Parcel ${contact.trackingNumber}: ${copy.subject}`,
        text,
        html,
      },
    ];
    if (SMS_STATUSES.has(to))
      messages.push({
        channel: "SMS",
        templateId: `status-sms-${to.toLowerCase()}`,
        to: contact.recipientPhone,
        text: `SwiftDrop: parcel ${contact.trackingNumber} ${copy.line}. Track: ${url}`,
      });
    return messages;
  }
  return [];
}
