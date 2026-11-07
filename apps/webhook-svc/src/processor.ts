import type { Logger } from "pino";
import {
  WEBHOOK_REPLAY_EVENT,
  eventEnvelopeSchema,
  parcelEventDataSchema,
  webhookReplayDataSchema,
  type EventEnvelope,
} from "@swiftdrop/contracts";
import {
  MAX_WEBHOOK_ATTEMPT,
  RETRY_DELAYS_SECONDS,
} from "@swiftdrop/messaging";
import type { WebhookConfigSource } from "./config-source.js";
import { UnsafeDestinationError } from "./destination.js";
import type { Sender } from "./sender.js";
import { signedHeaders } from "./signing.js";

/** What the consumer must do with the source message once the processor is finished. */
export type Disposition = "ack" | "requeue" | "reject";

export type InboundMessage = {
  content: Buffer;
  /** Attempt number from the `x-swiftdrop-attempt` header: 0 on first delivery. */
  attempt: number;
  /** Run from the `x-swiftdrop-run` header: 0 original, n for the nth Admin replay. */
  run: number;
  redelivered: boolean;
};

export type DeliveryStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";
export type DeliveryRecord = {
  id: string;
  eventId: string;
  merchantId: number;
  eventType: string;
  envelope: EventEnvelope;
  status: DeliveryStatus;
  currentRun: number;
};
export type Handoff = "NONE" | "RETRY" | "DLQ";
export type AttemptRecord = {
  id: string;
  handoff: Handoff;
  handoffConfirmed: boolean;
};
export type Claim =
  | { kind: "claimed"; attemptId: string }
  | { kind: "busy" }
  | { kind: "done"; attempt: AttemptRecord };

export interface DeliveryStore {
  ensureDelivery(input: {
    eventId: string;
    merchantId: number;
    eventType: string;
    envelope: EventEnvelope;
  }): Promise<DeliveryRecord>;
  findDelivery(id: string): Promise<DeliveryRecord | null>;
  claimAttempt(input: {
    deliveryId: string;
    run: number;
    attempt: number;
    takeover: boolean;
    now: Date;
    leaseMs: number;
  }): Promise<Claim>;
  completeAttempt(input: {
    attemptId: string;
    deliveryId: string;
    outcome: "SUCCESS" | "FAILURE" | "SKIPPED";
    statusCode?: number;
    latencyMs?: number;
    errorCode?: string;
    handoff: Handoff;
    nextRetryAt?: Date;
    deliveryStatus: DeliveryStatus;
    now: Date;
  }): Promise<void>;
  confirmHandoff(attemptId: string, now: Date): Promise<void>;
}

export type HandoffMessage = {
  content: Buffer;
  messageId: string;
  attempt: number;
  run: number;
};
/** Publishes with broker confirms; resolves only once the broker has the message. */
export interface HandoffPublisher {
  retry(message: HandoffMessage, delaySeconds: number): Promise<void>;
  deadLetter(message: HandoffMessage): Promise<void>;
}

const LEASE_MS = 30_000;

/**
 * The webhook delivery state machine (Design Doc §7.7, FR-I4). Pure orchestration over
 * injected ports so every branch is unit-testable without a broker or network.
 *
 * Invariants:
 * - progress is persisted *before* any hand-off, and a hand-off is confirmed *before* the
 *   source message is acknowledged; any failure leaves the source unacknowledged;
 * - the unique (delivery, run, attempt) claim means a redelivery resumes stored state and
 *   never advances the attempt counter twice or re-sends a completed attempt;
 * - configuration is reloaded and the body re-signed with a fresh timestamp on every attempt;
 * - the original eventId is retained for retries and replays.
 */
export class WebhookProcessor {
  private now: () => Date;
  private leaseMs: number;
  constructor(
    private deps: {
      store: DeliveryStore;
      config: WebhookConfigSource;
      sender: Sender;
      handoff: HandoffPublisher;
      logger: Logger;
      now?: () => Date;
      leaseMs?: number;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
    this.leaseMs = deps.leaseMs ?? LEASE_MS;
  }

  async handle(message: InboundMessage): Promise<Disposition> {
    try {
      return await this.process(message);
    } catch (error) {
      this.deps.logger.error({
        event: "webhook_processing_failed",
        message: error instanceof Error ? error.message : "unknown",
      });
      return "requeue";
    }
  }

  private async process(message: InboundMessage): Promise<Disposition> {
    const { store, logger } = this.deps;
    let envelope: EventEnvelope;
    try {
      envelope = eventEnvelopeSchema.parse(
        JSON.parse(message.content.toString("utf8")),
      );
    } catch {
      logger.warn({ event: "webhook_message_invalid" });
      return "reject";
    }

    let delivery: DeliveryRecord | null;
    if (envelope.type === WEBHOOK_REPLAY_EVENT) {
      const request = webhookReplayDataSchema.safeParse(envelope.data);
      if (!request.success) {
        logger.warn({
          event: "webhook_replay_invalid",
          eventId: envelope.eventId,
        });
        return "reject";
      }
      delivery = await store.findDelivery(request.data.deliveryId);
      if (!delivery) {
        logger.warn({
          event: "webhook_replay_unknown",
          eventId: envelope.eventId,
        });
        return "reject";
      }
      // The replay request itself names its run; headers only carry it on retries.
      message = { ...message, run: request.data.runNumber };
    } else if (envelope.type.startsWith("parcel.")) {
      const data = parcelEventDataSchema.safeParse(envelope.data);
      if (!data.success) {
        logger.warn({
          event: "webhook_event_invalid",
          eventId: envelope.eventId,
        });
        return "reject";
      }
      // Only merchant-owned parcels have a webhook; customer parcels are not for us.
      if (!data.data.merchantId) return "ack";
      delivery = await store.ensureDelivery({
        eventId: envelope.eventId,
        merchantId: data.data.merchantId,
        eventType: envelope.type,
        envelope,
      });
    } else return "ack";

    if (message.run !== delivery.currentRun) {
      // A newer replay run superseded this message.
      logger.info({
        event: "webhook_stale_run",
        deliveryId: delivery.id,
        run: message.run,
      });
      return "ack";
    }

    const claim = await store.claimAttempt({
      deliveryId: delivery.id,
      run: message.run,
      attempt: message.attempt,
      takeover: message.redelivered,
      now: this.now(),
      leaseMs: this.leaseMs,
    });
    // `busy`: another consumer holds a live copy of this exact attempt. Its own unacked
    // delivery is redelivered if it crashes, so acknowledging this duplicate is safe.
    if (claim.kind === "busy") return "ack";
    const handoffMessage: HandoffMessage = {
      content: message.content,
      messageId: envelope.eventId,
      attempt: message.attempt + 1,
      run: message.run,
    };
    if (claim.kind === "done")
      return this.finishHandoff(claim.attempt, handoffMessage, message.attempt);
    return this.execute(delivery, claim.attemptId, message, handoffMessage);
  }

  private async execute(
    delivery: DeliveryRecord,
    attemptId: string,
    message: InboundMessage,
    handoffMessage: HandoffMessage,
  ): Promise<Disposition> {
    const { store, config, sender } = this.deps;
    const attempt = message.attempt;
    const finish = async (
      result: Omit<
        Parameters<DeliveryStore["completeAttempt"]>[0],
        "attemptId" | "deliveryId" | "now"
      >,
    ) => {
      await store.completeAttempt({
        ...result,
        attemptId,
        deliveryId: delivery.id,
        now: this.now(),
      });
      return this.finishHandoff(
        { id: attemptId, handoff: result.handoff, handoffConfirmed: false },
        handoffMessage,
        attempt,
      );
    };

    let target;
    try {
      target = await config.get(delivery.merchantId);
    } catch {
      return finish(this.failure(attempt, "CONFIG_UNAVAILABLE"));
    }
    if (!target)
      // Not configured is a recorded outcome, not a retryable failure.
      return finish({
        outcome: "SKIPPED",
        errorCode: "NOT_CONFIGURED",
        handoff: "NONE",
        deliveryStatus: "SKIPPED",
      });

    // Exact bytes that are sent are the bytes that are signed.
    const body = JSON.stringify(delivery.envelope);
    const headers = signedHeaders({
      secret: target.secret,
      body,
      eventId: delivery.envelope.eventId,
      attempt,
      now: this.now(),
    });
    try {
      const result = await sender.send(target.url, body, headers);
      if (result.ok)
        return finish({
          outcome: "SUCCESS",
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          handoff: "NONE",
          deliveryStatus: "SUCCESS",
        });
      return finish({
        ...this.failure(attempt, result.errorCode ?? "FAILED"),
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      if (error instanceof UnsafeDestinationError)
        // Never retry an unsafe destination; park it straight away for Admin review.
        return finish({
          outcome: "FAILURE",
          errorCode: error.code,
          handoff: "DLQ",
          deliveryStatus: "FAILED",
        });
      throw error;
    }
  }

  /** Attempts below the limit get a fixed-delay retry; the last attempt goes to the DLQ. */
  private failure(attempt: number, errorCode: string) {
    if (attempt < MAX_WEBHOOK_ATTEMPT)
      return {
        outcome: "FAILURE" as const,
        errorCode,
        handoff: "RETRY" as const,
        deliveryStatus: "PENDING" as const,
        nextRetryAt: new Date(
          this.now().getTime() + RETRY_DELAYS_SECONDS[attempt]! * 1000,
        ),
      };
    return {
      outcome: "FAILURE" as const,
      errorCode,
      handoff: "DLQ" as const,
      deliveryStatus: "FAILED" as const,
    };
  }

  private async finishHandoff(
    attempt: AttemptRecord,
    message: HandoffMessage,
    attemptNumber: number,
  ): Promise<Disposition> {
    if (attempt.handoff === "NONE" || attempt.handoffConfirmed) return "ack";
    try {
      if (attempt.handoff === "RETRY")
        await this.deps.handoff.retry(
          message,
          RETRY_DELAYS_SECONDS[attemptNumber]!,
        );
      else await this.deps.handoff.deadLetter(message);
      await this.deps.store.confirmHandoff(attempt.id, this.now());
      return "ack";
    } catch (error) {
      // Not confirmed: leave the source unacknowledged. Redelivery sees the stored attempt
      // and repeats only the hand-off, without sending the webhook again.
      this.deps.logger.warn({
        event: "webhook_handoff_unconfirmed",
        message: error instanceof Error ? error.message : "unknown",
      });
      return "requeue";
    }
  }
}
