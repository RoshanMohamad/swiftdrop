import nodemailer from "nodemailer";
import type { Logger } from "pino";
import { maskPhone } from "./masking.js";
import type { EmailSender, NotificationMessage, SmsSender } from "./types.js";

export class SmtpEmailSender implements EmailSender {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(input: {
    recipient: string;
    subject?: string;
    body: string;
    eventId: string;
  }) {
    const result = await this.transport.sendMail({
      from: this.from,
      to: input.recipient,
      subject: input.subject,
      text: input.body,
      headers: { "X-SwiftDrop-Event-ID": input.eventId },
    });
    return { providerMessageId: result.messageId };
  }
}

/** Development adapter: performs no external send and logs only a masked phone. */
export class MockSmsSender implements SmsSender {
  constructor(private readonly logger: Pick<Logger, "info">) {}

  async send(input: NotificationMessage) {
    this.logger.info(
      { eventId: input.eventId, recipientMasked: maskPhone(input.recipient) },
      "Mock SMS accepted",
    );
    return { providerMessageId: `mock:${input.eventId}` };
  }
}
