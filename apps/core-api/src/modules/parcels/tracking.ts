import { randomInt } from "node:crypto";
import {
  TRACKING_ALPHABET,
  TRACKING_BODY_LENGTH,
  formatTrackingNumber,
} from "@swiftdrop/contracts";

/**
 * A new tracking number: 8 characters drawn uniformly from the unambiguous alphabet with a CSPRNG
 * (`randomInt` has no modulo bias), plus the check character. Never sequential or guessable from
 * the previous one; the format itself lives in `@swiftdrop/contracts` so the API, the SPA and
 * the realtime gateway all validate against the same definition.
 */
export function generateTrackingNumber(): string {
  let body = "";
  for (let index = 0; index < TRACKING_BODY_LENGTH; index++)
    body += TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)];
  return formatTrackingNumber(body);
}
