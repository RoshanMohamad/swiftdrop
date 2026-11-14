import type { ConfirmChannel, Options } from "amqplib";

export class UnroutableError extends Error {
  constructor(exchange: string, routingKey: string) {
    super(`No queue accepted ${routingKey} on ${exchange}.`);
  }
}

export type ConfirmedMessage = {
  exchange: string;
  routingKey: string;
  content: Buffer;
  messageId: string;
  headers?: Options.Publish["headers"];
  type?: string;
};

/**
 * Publish with broker confirms and `mandatory`. A message the broker could not route is
 * returned before its ack, so "confirmed" alone would be a false success: we reject it.
 * Resolves only when the broker has taken responsibility for a routed, persistent message.
 */
export function createConfirmedPublisher(channel: ConfirmChannel) {
  const returned = new Map<string, number>();
  channel.on("return", (message) => {
    const id = message.properties.messageId as string | undefined;
    if (id) returned.set(id, (returned.get(id) ?? 0) + 1);
  });
  return {
    publish(message: ConfirmedMessage): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          channel.publish(
            message.exchange,
            message.routingKey,
            message.content,
            {
              persistent: true,
              mandatory: true,
              contentType: "application/json",
              messageId: message.messageId,
              type: message.type,
              headers: message.headers,
            },
            (error) => {
              const count = returned.get(message.messageId) ?? 0;
              if (count > 1) returned.set(message.messageId, count - 1);
              else returned.delete(message.messageId);
              if (error)
                reject(
                  error instanceof Error
                    ? error
                    : new Error("Publish was not confirmed."),
                );
              else if (count > 0)
                reject(
                  new UnroutableError(message.exchange, message.routingKey),
                );
              else resolve();
            },
          );
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Publish failed."));
        }
      });
    },
  };
}
export type ConfirmedPublisher = ReturnType<typeof createConfirmedPublisher>;
