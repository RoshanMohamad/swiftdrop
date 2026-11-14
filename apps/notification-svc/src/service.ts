import type { SwiftDropEvent } from "@swiftdrop/contracts";
import { maskEmail, maskPhone } from "./masking.js";
import { DefaultNotificationTemplateRenderer } from "./templates.js";
import type {
  ContactLookupClient,
  EmailSender,
  NotificationChannel,
  NotificationEvent,
  NotificationProgress,
  NotificationRecipient,
  NotificationSendResult,
  NotificationTemplateRenderer,
  RenderedNotification,
  SmsSender,
} from "./types.js";

const MASKED_UNAVAILABLE_RECIPIENT = "***unavailable";

export class NotificationProcessingError extends Error {
  constructor(public readonly attempts: number) {
    super("Notification processing failed.");
  }
}

export class NotificationService {
  constructor(
    private readonly progress: NotificationProgress,
    private readonly lookup: ContactLookupClient,
    private readonly email: EmailSender,
    private readonly sms: SmsSender,
    private readonly templates: NotificationTemplateRenderer = new DefaultNotificationTemplateRenderer(),
  ) {}

  async process(event: SwiftDropEvent) {
    if (
      event.type !== "parcel.created" &&
      event.type !== "parcel.status.changed"
    )
      return "ignored" as const;

    const acquired = await this.progress.acquire(event.eventId);
    if (acquired !== "acquired") return acquired;

    try {
      await this.deliver(event);
      await this.progress.complete(event.eventId);
      return "completed" as const;
    } catch {
      throw new NotificationProcessingError(
        await this.progress.fail(event.eventId),
      );
    }
  }

  private async deliver(event: NotificationEvent) {
    let recipient: NotificationRecipient;
    try {
      recipient = await this.lookup.lookup(event);
    } catch {
      await this.recordUnavailableChannels(
        event,
        event.type === "parcel.created"
          ? "booking_confirmation"
          : "status_update",
        "CONTACT_LOOKUP_FAILED",
      );
      throw new Error("Notification contact lookup failed.");
    }
    if (
      recipient.eventId !== event.eventId ||
      recipient.parcelId !== event.data.parcelId
    ) {
      await this.recordUnavailableChannels(
        event,
        event.type === "parcel.created"
          ? "booking_confirmation"
          : "status_update",
        "CONTACT_LOOKUP_MISMATCH",
      );
      throw new Error("Notification lookup did not match the event.");
    }
    let rendered: RenderedNotification;
    try {
      rendered = this.templates.render(event, recipient);
    } catch {
      await Promise.all([
        this.progress.record({
          eventId: event.eventId,
          channel: "EMAIL",
          templateId:
            event.type === "parcel.created"
              ? "booking_confirmation"
              : "status_update",
          recipientMasked: maskEmail(recipient.customerEmail),
          status: "SKIPPED",
          errorMessage: "TEMPLATE_RENDER_FAILED",
        }),
        this.progress.record({
          eventId: event.eventId,
          channel: "SMS",
          templateId:
            event.type === "parcel.created"
              ? "booking_confirmation"
              : "status_update",
          recipientMasked: maskPhone(recipient.recipientPhone),
          status: "SKIPPED",
          errorMessage: "TEMPLATE_RENDER_FAILED",
        }),
      ]);
      throw new Error("Notification template rendering failed.");
    }
    let failed = false;
    failed =
      (await this.deliverChannel({
        event,
        channel: "EMAIL",
        sender: this.email,
        recipient: recipient.customerEmail,
        recipientMasked: maskEmail(recipient.customerEmail),
        templateId: rendered.templateId,
        subject: rendered.subject,
        body: rendered.emailBody,
      })) || failed;
    failed =
      (await this.deliverChannel({
        event,
        channel: "SMS",
        sender: this.sms,
        recipient: recipient.recipientPhone,
        recipientMasked: maskPhone(recipient.recipientPhone),
        templateId: rendered.templateId,
        body: rendered.smsBody,
      })) || failed;
    if (failed) throw new Error("One or more notification channels failed.");
  }

  private async deliverChannel(input: {
    event: NotificationEvent;
    channel: NotificationChannel;
    sender: EmailSender | SmsSender;
    recipient: string;
    recipientMasked: string;
    templateId: string;
    subject?: string;
    body: string;
  }) {
    if (await this.progress.wasSent(input.event.eventId, input.channel))
      return false;
    let result: NotificationSendResult;
    try {
      result = await input.sender.send({
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        eventId: input.event.eventId,
      });
    } catch {
      await this.progress.record({
        eventId: input.event.eventId,
        channel: input.channel,
        templateId: input.templateId,
        recipientMasked: input.recipientMasked,
        status: "FAILED",
        errorMessage: "DELIVERY_FAILED",
      });
      return true;
    }
    await this.progress.record({
      eventId: input.event.eventId,
      channel: input.channel,
      templateId: input.templateId,
      recipientMasked: input.recipientMasked,
      status: "SENT",
      providerMessageId: result.providerMessageId,
    });
    return false;
  }

  private async recordUnavailableChannels(
    event: NotificationEvent,
    templateId: "booking_confirmation" | "status_update",
    errorMessage: "CONTACT_LOOKUP_FAILED" | "CONTACT_LOOKUP_MISMATCH",
  ) {
    await Promise.all(
      (["EMAIL", "SMS"] as const).map((channel) =>
        this.progress.record({
          eventId: event.eventId,
          channel,
          templateId,
          recipientMasked: MASKED_UNAVAILABLE_RECIPIENT,
          status: "SKIPPED",
          errorMessage,
        }),
      ),
    );
  }
}
