import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords, RFC 6238 over RFC 4226 (HMAC-SHA1, 6 digits, 30 second steps),
 * the parameters every authenticator app supports. Only Node's `crypto` HMAC is used; this file
 * adds the counter, truncation and base32 plumbing and is checked against the RFC's published
 * test vectors in test/totp.unit.test.ts. The rest of the system talks to it through
 * `newTotpSecret`, `verifyTotp` and `otpauthUri`, so swapping in a maintained library later
 * touches only this file.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size RFC 4226 recommends for SHA-1, as base32 for the authenticator. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226 section 5.3): dynamic truncation of HMAC-SHA1 over the 8 byte counter. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (timeMs: number) =>
  Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS);

export function totpAt(secretBase32: string, timeMs: number): string {
  return hotp(base32Decode(secretBase32), totpStep(timeMs));
}

/**
 * Checks a submitted code against the current step and `window` steps either side (clock drift).
 * A step at or below `lastUsedStep` is refused, so an accepted code can never be replayed, even
 * inside its own validity window. Returns the matching step for the caller to store atomically.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  options: { window?: number; lastUsedStep?: number | null } = {},
): { ok: true; step: number } | { ok: false } {
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const window = options.window ?? 1;
  const secret = base32Decode(secretBase32);
  const submitted = Buffer.from(code);
  const current = totpStep(nowMs);
  let match: number | null = null;
  // Evaluate every candidate step (no early exit) so timing does not reveal which one matched.
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    const expected = Buffer.from(hotp(secret, step));
    const equal = timingSafeEqual(expected, submitted);
    const fresh =
      options.lastUsedStep === null ||
      options.lastUsedStep === undefined ||
      step > options.lastUsedStep;
    if (equal && fresh && (match === null || step > match)) match = step;
  }
  return match === null ? { ok: false } : { ok: true, step: match };
}

/** The `otpauth://` URI authenticator apps import (manual key entry shows the same secret). */
export function otpauthUri(secretBase32: string, account: string, issuer: string) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
