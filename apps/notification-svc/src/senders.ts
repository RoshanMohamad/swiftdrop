import nodemailer from "nodemailer";
import type { Logger } from "pino";
import type { NotificationMessage } from "./types.js";
import type { Message } from "./templates.js";
import { maskPhone } from "./mask.js";
import { maskPhone as maskNotificationPhone } from "./masking.js";

export interface MessageSender {
  send(message: Message): Promise<{ providerMessageId?: string }>;
}

/** Email over SMTP (Mailpit in development). */
export class SmtpEmailSender implements MessageSender {
  private readonly transport;
  constructor(
    smtpUrl: string,
    private readonly from = "SwiftDrop <no-reply@swiftdrop.test>",
  ) {
    this.transport = nodemailer.createTransport({
      url: smtpUrl,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  async send(input: Message | NotificationMessage) {
    const message =
      "recipient" in input
        ? {
            to: input.recipient,
            subject: input.subject,
            text: input.body,
            templateId: "notification",
            channel: "SMS" as const,
          }
        : input;
    const info = (await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: "html" in message ? message.html : undefined,
      headers:
        "eventId" in input
          ? { "X-SwiftDrop-Event-ID": input.eventId }
          : undefined,
    })) as { messageId?: string };
    return { providerMessageId: info.messageId };
  }
}

/**
 * Mock SMS adapter (plan: SMS is a mock only). It logs the masked number and message length,
 * never the number or text. A real gateway would implement the same interface.
 */
export class MockSmsSender implements MessageSender {
  readonly sent: Message[] = [];
  constructor(private logger: Pick<Logger, "info">) {}
  async send(input: Message | NotificationMessage) {
    if ("recipient" in input) {
      this.logger.info(
        {
          eventId: input.eventId,
          recipientMasked: maskNotificationPhone(input.recipient),
        },
        "Mock SMS accepted",
      );
      return { providerMessageId: `mock:${input.eventId}` };
    }
    const message = input;
    this.sent.push(message);
    this.logger.info({
      event: "sms_mock_sent",
      template: message.templateId,
      recipient: maskPhone(message.to),
      length: message.text.length,
    });
    return { providerMessageId: `mock-sms-${this.sent.length}` };
  }
}

export function createChannelSender(senders: {
  EMAIL: MessageSender;
  SMS: MessageSender;
}): MessageSender {
  return { send: (message) => senders[message.channel].send(message) };
}
