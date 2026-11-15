import nodemailer from "nodemailer";
import type { Logger } from "pino";
import type { Message } from "./templates.js";
import { maskPhone } from "./mask.js";

export interface MessageSender {
  send(message: Message): Promise<{ providerMessageId?: string }>;
}

/** Email over SMTP (Mailpit in development). */
export class SmtpEmailSender implements MessageSender {
  private readonly transport;
  constructor(smtpUrl: string) {
    this.transport = nodemailer.createTransport({
      url: smtpUrl,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  async send(message: Message) {
    const info = (await this.transport.sendMail({
      from: "SwiftDrop <no-reply@swiftdrop.test>",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
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
  constructor(private logger: Logger) {}
  async send(message: Message) {
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
