import https from "node:https";
import http from "node:http";
import {
  UnsafeDestinationError,
  guardedLookup,
  parseDestination,
} from "./destination.js";

export type SendResult = {
  ok: boolean;
  statusCode?: number;
  errorCode?: string;
  latencyMs: number;
};
export interface Sender {
  /** Throws `UnsafeDestinationError` when the destination must not be contacted at all. */
  send(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<SendResult>;
}

export const REQUEST_TIMEOUT_MS = 5000;

/**
 * One HTTPS POST with a hard timeout (Design Doc §7.7: 5 seconds). Redirects are never
 * followed (a 3xx is a failure), the response body is discarded, and every connection goes
 * through `guardedLookup` so private, loopback and link-local targets are refused.
 */
export class HttpWebhookSender implements Sender {
  constructor(
    private options: { timeoutMs?: number; devAllowedHosts?: string[] } = {},
  ) {}

  async send(
    rawUrl: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<SendResult> {
    const { url, dev } = parseDestination(
      rawUrl,
      this.options.devAllowedHosts ?? [],
    );
    const started = Date.now();
    const done = (partial: Omit<SendResult, "latencyMs">): SendResult => ({
      ...partial,
      latencyMs: Date.now() - started,
    });
    const transport = url.protocol === "https:" ? https : http;
    return new Promise<SendResult>((resolve, reject) => {
      const request = transport.request(
        url,
        {
          method: "POST",
          agent: false,
          headers: {
            ...headers,
            "Content-Length": String(Buffer.byteLength(body)),
          },
          signal: AbortSignal.timeout(
            this.options.timeoutMs ?? REQUEST_TIMEOUT_MS,
          ),
          ...(dev ? {} : { lookup: guardedLookup as never }),
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;
          response.resume();
          response.once("close", () => undefined);
          resolve(
            statusCode >= 200 && statusCode < 300
              ? done({ ok: true, statusCode })
              : done({
                  ok: false,
                  statusCode,
                  errorCode: `HTTP_${statusCode}`,
                }),
          );
          request.destroy();
        },
      );
      request.once("error", (error: Error & { code?: string }) => {
        if (error instanceof UnsafeDestinationError) return reject(error);
        if (error.name === "AbortError" || error.name === "TimeoutError")
          return resolve(done({ ok: false, errorCode: "TIMEOUT" }));
        resolve(done({ ok: false, errorCode: "NETWORK" }));
      });
      request.end(body);
    });
  }
}
