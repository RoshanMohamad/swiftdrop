import { Prisma, type Database } from "@swiftdrop/db";
import type { Message } from "./templates.js";
import { maskRecipient } from "./mask.js";

export const CONSUMER = "notification-svc";

export type Claim = "claimed" | "done" | "busy";

/** Durable progress keyed by eventId (FR-I3). */
export interface ProgressStore {
  claim(eventId: string, leaseMs: number): Promise<Claim>;
  complete(eventId: string): Promise<void>;
  release(eventId: string): Promise<void>;
  alreadySent(eventId: string, message: Message): Promise<boolean>;
  record(
    eventId: string,
    message: Message,
    outcome: {
      status: "SENT" | "FAILED";
      providerMessageId?: string;
      error?: string;
    },
  ): Promise<void>;
}

export class PrismaProgressStore implements ProgressStore {
  constructor(private db: Database) {}

  async claim(eventId: string, leaseMs: number): Promise<Claim> {
    const leaseExpiresAt = new Date(Date.now() + leaseMs);
    try {
      await this.db.processedEvent.create({
        data: {
          consumer: CONSUMER,
          eventId,
          status: "PROCESSING",
          leaseExpiresAt,
        },
      });
      return "claimed";
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
    }
    const taken = await this.db.processedEvent.updateMany({
      where: {
        consumer: CONSUMER,
        eventId,
        OR: [
          { status: "FAILED" },
          { status: "PROCESSING", leaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: { status: "PROCESSING", leaseExpiresAt },
    });
    if (taken.count === 1) return "claimed";
    const row = await this.db.processedEvent.findUnique({
      where: { consumer_eventId: { consumer: CONSUMER, eventId } },
      select: { status: true },
    });
    return row?.status === "DONE" ? "done" : "busy";
  }

  async complete(eventId: string) {
    await this.db.processedEvent.updateMany({
      where: { consumer: CONSUMER, eventId },
      data: { status: "DONE", completedAt: new Date(), leaseExpiresAt: null },
    });
  }

  async release(eventId: string) {
    await this.db.processedEvent.updateMany({
      where: { consumer: CONSUMER, eventId, status: "PROCESSING" },
      data: { status: "FAILED", leaseExpiresAt: null },
    });
  }

  async alreadySent(eventId: string, message: Message) {
    const row = await this.db.notificationLog.findUnique({
      where: {
        eventId_channel_templateId: {
          eventId,
          channel: message.channel,
          templateId: message.templateId,
        },
      },
      select: { status: true },
    });
    return row?.status === "SENT";
  }

  async record(
    eventId: string,
    message: Message,
    outcome: {
      status: "SENT" | "FAILED";
      providerMessageId?: string;
      error?: string;
    },
  ) {
    const data = {
      recipientMasked: maskRecipient(message.channel, message.to),
      status: outcome.status,
      providerMsgId: outcome.providerMessageId ?? null,
      sentAt: outcome.status === "SENT" ? new Date() : null,
      // Error text is a classification only: transports can echo addresses back.
      errorMsg: outcome.error ?? null,
    };
    await this.db.notificationLog.upsert({
      where: {
        eventId_channel_templateId: {
          eventId,
          channel: message.channel,
          templateId: message.templateId,
        },
      },
      update: data,
      create: {
        eventId,
        channel: message.channel,
        templateId: message.templateId,
        ...data,
      },
    });
  }
}
