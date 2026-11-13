import type { NotificationEvent, NotificationRecipient } from "./types.js";

export interface RenderedNotification {
  templateId: string;
  subject: string;
  emailBody: string;
  smsBody: string;
}

const humanStatus = (status: string) =>
  status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function renderNotification(
  event: NotificationEvent,
  recipient: NotificationRecipient,
): RenderedNotification {
  if (event.type === "parcel.created")
    return {
      templateId: "parcel-created-v1",
      subject: `SwiftDrop booking ${recipient.trackingNumber}`,
      emailBody: `Your SwiftDrop booking is confirmed. Tracking number: ${recipient.trackingNumber}.`,
      smsBody: `SwiftDrop booking confirmed: ${recipient.trackingNumber}.`,
    };

  const status = humanStatus(event.data.to);
  const place = event.data.town ? ` in ${event.data.town}` : "";
  return {
    templateId: "parcel-status-v1",
    subject: `SwiftDrop ${recipient.trackingNumber}: ${status}`,
    emailBody: `Your parcel ${recipient.trackingNumber} is now ${status}${place}.`,
    smsBody: `SwiftDrop ${recipient.trackingNumber}: ${status}${place}.`,
  };
}
