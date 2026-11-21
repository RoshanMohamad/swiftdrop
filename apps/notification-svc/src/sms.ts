import type { Logger } from "pino";
import type { NotificationConfig } from "./config.js";
import { MockSmsSender } from "./senders.js";
import { maskPhone } from "./masking.js";
import type { NotificationMessage, SmsSender } from "./types.js";

const TEXTLK_ENDPOINT = "https://app.text.lk/api/v3/sms/send";

/** One Sri Lankan mobile recipient, never a comma-separated bulk send. */
export function textLkRecipient(input: string) {
  const number = input.trim();
  if (/^\+947\d{8}$/.test(number)) return number.slice(1);
  if (/^947\d{8}$/.test(number)) return number;
  if (/^07\d{8}$/.test(number)) return `94${number.slice(1)}`;
  throw new Error("SMS_RECIPIENT_INVALID");
}

export class TextLkSmsSender implements SmsSender {
  constructor(
    private readonly token: string,
    private readonly senderId: string,
    private readonly logger: Pick<Logger, "info">,
    private readonly request: typeof fetch = fetch,
  ) {}

  async send(input: NotificationMessage) {
    const recipient = textLkRecipient(input.recipient);
    // Provider bodies may echo contacts or credentials. Never attach them to errors/logs.
    let response: Response;
    let payload: unknown;
    try {
      response = await this.request(TEXTLK_ENDPOINT, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          recipient,
          sender_id: this.senderId,
          type: "plain",
          message: input.body,
        }),
      });
      payload = await response.json();
    } catch {
      throw new Error("SMS_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok || !payload || typeof payload !== "object")
      throw new Error("SMS_PROVIDER_REJECTED");
    const result = payload as {
      status?: unknown;
      data?: { uid?: unknown; status?: unknown };
    };
    const id = result.data?.uid;
    const deliveryStatus = result.data?.status;
    if (
      result.status !== "success" ||
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      (typeof deliveryStatus === "string" &&
        /^(failed|undelivered|rejected|cancelled|canceled)$/i.test(
          deliveryStatus,
        ))
    )
      throw new Error("SMS_PROVIDER_REJECTED");
    this.logger.info(
      {
        eventId: input.eventId,
        provider: "textlk",
        recipientMasked: maskPhone(recipient),
      },
      "SMS accepted by provider",
    );
    return { providerMessageId: id };
  }
}

export function createSmsSender(
  config: Pick<
    NotificationConfig,
    "SMS_PROVIDER" | "TEXTLK_API_TOKEN" | "TEXTLK_SENDER_ID"
  >,
  logger: Pick<Logger, "info">,
): SmsSender {
  return config.SMS_PROVIDER === "textlk"
    ? new TextLkSmsSender(
        config.TEXTLK_API_TOKEN,
        config.TEXTLK_SENDER_ID,
        logger,
      )
    : new MockSmsSender(logger);
}
