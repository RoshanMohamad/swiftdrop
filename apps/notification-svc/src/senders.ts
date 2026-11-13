import nodemailer from "nodemailer";
import type { MessageSender } from "./types.js";

export class SmtpEmailSender implements MessageSender {
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

/** Development adapter: performs no external send and never logs the recipient. */
export class MockSmsSender implements MessageSender {
  async send(input: { eventId: string }) {
    return { providerMessageId: `mock:${input.eventId}` };
  }
}
