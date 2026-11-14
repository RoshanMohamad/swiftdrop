import type { SwiftDropEvent } from "@swiftdrop/contracts";
import { maskEmail, maskPhone } from "./masking.js";
import { DefaultNotificationTemplateRenderer } from "./templates.js";
import type {
  ContactLookupClient,
  EmailSender,
  NotificationChannel,
  NotificationEvent,
  NotificationProgress,
  NotificationTemplateRenderer,
  SmsSender,
} from "./types.js";

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
    const recipient = await this.lookup.lookup(event);
    if (
      recipient.eventId !== event.eventId ||
      recipient.parcelId !== event.data.parcelId
    )
      throw new Error("Notification lookup did not match the event.");
    const rendered = this.templates.render(event, recipient);
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
    try {
      const result = await input.sender.send({
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        eventId: input.event.eventId,
      });
      await this.progress.record({
        eventId: input.event.eventId,
        channel: input.channel,
        templateId: input.templateId,
        recipientMasked: input.recipientMasked,
        status: "SENT",
        providerMessageId: result.providerMessageId,
      });
      return false;
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
  }
}
