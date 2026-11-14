import type { Logger } from "pino";
import { isSwiftDropEvent, type SwiftDropEvent } from "@swiftdrop/contracts";
import { LookupError, type ContactLookup } from "./lookup.js";
import type { MessageSender } from "./senders.js";
import type { ProgressStore } from "./store.js";
import { renderMessages } from "./templates.js";

/** What the consumer does with the broker message. */
export type Disposition = "ack" | "reject" | "requeue";

const LEASE_MS = 60_000;

/**
 * Notification handling for one `notifications.q` message (FR-I3).
 *
 * Progress is keyed by eventId: a completed event is acknowledged without sending again. Each
 * (event, channel, template) is also recorded, so a retry after a partial failure only sends the
 * messages that are still missing. Residual limit: if the process crashes after the provider
 * accepted a message but before its log row is written, the retry sends that message again;
 * SMTP and the SMS adapter offer no provider-side idempotency key.
 */
export class NotificationProcessor {
  constructor(
    private deps: {
      store: ProgressStore;
      lookup: ContactLookup;
      sender: MessageSender;
      appOrigin: string;
      logger: Logger;
    },
  ) {}

  async handle(content: Buffer): Promise<Disposition> {
    const { store, lookup, sender, appOrigin, logger } = this.deps;
    let event: SwiftDropEvent;
    try {
      const parsed: unknown = JSON.parse(content.toString("utf8"));
      if (!isSwiftDropEvent(parsed)) {
        logger.warn({ event: "notification_event_invalid" });
        return "reject";
      }
      event = parsed;
    } catch {
      logger.warn({ event: "notification_event_unparseable" });
      return "reject";
    }
    // Defensive: only these two types are bound to notifications.q.
    if (event.type === "parcel.assignment.changed") return "ack";

    let claim;
    try {
      claim = await store.claim(event.eventId, LEASE_MS);
    } catch {
      return "requeue";
    }
    if (claim === "done") {
      logger.info({
        event: "notification_duplicate_suppressed",
        eventId: event.eventId,
      });
      return "ack";
    }
    if (claim === "busy") return "requeue";

    try {
      let contact;
      try {
        contact = await lookup.fetch(event.eventId, event.data.parcelId);
      } catch (error) {
        if (error instanceof LookupError && error.kind === "not_found") {
          await store.release(event.eventId);
          logger.warn({
            event: "notification_contact_missing",
            eventId: event.eventId,
          });
          return "reject";
        }
        throw error;
      }
      const messages = renderMessages(event, contact, appOrigin);
      let failures = 0;
      for (const message of messages) {
        if (await store.alreadySent(event.eventId, message)) continue;
        try {
          const result = await sender.send(message);
          await store.record(event.eventId, message, {
            status: "SENT",
            providerMessageId: result.providerMessageId,
          });
        } catch (error) {
          failures += 1;
          await store.record(event.eventId, message, {
            status: "FAILED",
            error: error instanceof Error ? error.name : "SendError",
          });
          logger.warn({
            event: "notification_send_failed",
            eventId: event.eventId,
            channel: message.channel,
            template: message.templateId,
          });
        }
      }
      if (failures > 0) {
        await store.release(event.eventId);
        return "requeue";
      }
      await store.complete(event.eventId);
      return "ack";
    } catch (error) {
      logger.warn({
        event: "notification_processing_failed",
        eventId: event.eventId,
        message: error instanceof Error ? error.message : "unknown",
      });
      await store.release(event.eventId).catch(() => undefined);
      return "requeue";
    }
  }
}
