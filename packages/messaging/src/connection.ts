import { connect, type ChannelModel } from "amqplib";
import type { Logger } from "pino";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

/**
 * Keep a broker connection alive until `signal` aborts. `session` runs while connected and
 * must return when `closed` settles (connection lost) or the signal aborts. Reconnects with
 * capped exponential backoff; never throws, so a broker outage cannot crash a worker.
 */
export async function runWithBroker(options: {
  url: string;
  logger: Logger;
  signal: AbortSignal;
  onState?: (connected: boolean) => void;
  session: (
    connection: ChannelModel,
    context: { closed: Promise<void>; signal: AbortSignal },
  ) => Promise<void>;
}) {
  const { url, logger, signal, onState, session } = options;
  let delay = 1000;
  while (!signal.aborted) {
    let connection: ChannelModel | undefined;
    try {
      connection = await connect(
        `${url}${url.includes("?") ? "&" : "?"}heartbeat=10`,
      );
      const closed = new Promise<void>((resolve) => {
        connection!.once("error", () => resolve());
        connection!.once("close", () => resolve());
      });
      // An 'error' with no listener would crash the process.
      connection.on("error", (error: Error) =>
        logger.warn({ event: "broker_error", message: error.message }),
      );
      onState?.(true);
      delay = 1000;
      logger.info({ event: "broker_connected" });
      await session(connection, { closed, signal });
    } catch (error) {
      logger.warn({
        event: "broker_session_failed",
        message: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      onState?.(false);
      try {
        await connection?.close();
      } catch {
        /* already closed */
      }
    }
    if (!signal.aborted) {
      await sleep(delay, signal);
      delay = Math.min(delay * 2, 15_000);
    }
  }
}
