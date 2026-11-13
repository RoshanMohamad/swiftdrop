import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature (Design Doc §9.3). Each attempt signs the exact body bytes with a fresh
 * timestamp: `HMAC-SHA256(secret, "<timestamp>.<body>")`. Merchants must reject timestamps
 * older than five minutes and deduplicate `X-SwiftDrop-Event-Id` before business effects.
 */
export const HEADERS = {
  signature: "X-SwiftDrop-Signature",
  timestamp: "X-SwiftDrop-Timestamp",
  eventId: "X-SwiftDrop-Event-Id",
  attempt: "X-SwiftDrop-Attempt",
} as const;
export const FRESHNESS_SECONDS = 300;

export const sign = (secret: string, timestamp: number, body: string) =>
  `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

export function signedHeaders(input: {
  secret: string;
  body: string;
  eventId: string;
  attempt: number;
  now: Date;
}): Record<string, string> {
  const timestamp = Math.floor(input.now.getTime() / 1000);
  return {
    "Content-Type": "application/json",
    "User-Agent": "SwiftDrop-Webhooks/1",
    [HEADERS.timestamp]: String(timestamp),
    [HEADERS.signature]: sign(input.secret, timestamp, input.body),
    [HEADERS.eventId]: input.eventId,
    [HEADERS.attempt]: String(input.attempt),
  };
}

/** Reference verifier: what a merchant receiver should do. Used by tests and docs. */
export function verify(input: {
  secret: string;
  body: string;
  timestamp: string;
  signature: string;
  now: Date;
}): boolean {
  const timestamp = Number(input.timestamp);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(input.now.getTime() / 1000 - timestamp) > FRESHNESS_SECONDS)
    return false;
  const expected = Buffer.from(sign(input.secret, timestamp, input.body));
  const actual = Buffer.from(input.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
