/**
 * The tracking number format (claude.md, Data rules): `SD-` + 8 random characters from an
 * unambiguous alphabet + `-` + 1 check character, for example `SD-7KQ2M9XA-P`.
 *
 * The alphabet leaves out 0, 1, I, L and O so a number read aloud, handwritten or typed from a
 * label cannot be confused with a look-alike. It has 31 characters, a prime, so a position-
 * weighted sum modulo 31 as the check character catches every single-character typo and every
 * swap of two adjacent characters. Numbers are random, never sequential.
 */
export const TRACKING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TRACKING_BODY_LENGTH = 8;
const CLASS = `[${TRACKING_ALPHABET}]`;
export const TRACKING_PATTERN = new RegExp(
  `^SD-${CLASS}{${TRACKING_BODY_LENGTH}}-${CLASS}$`,
);

export function trackingCheckCharacter(body: string): string {
  let sum = 0;
  for (let index = 0; index < body.length; index++)
    sum += (index + 1) * TRACKING_ALPHABET.indexOf(body[index]!);
  return TRACKING_ALPHABET[sum % TRACKING_ALPHABET.length]!;
}

/** Builds a number from a body of 8 alphabet characters (the generator supplies the randomness). */
export function formatTrackingNumber(body: string): string {
  return `SD-${body}-${trackingCheckCharacter(body)}`;
}

export function isValidTrackingNumber(value: string): boolean {
  if (!TRACKING_PATTERN.test(value)) return false;
  return trackingCheckCharacter(value.slice(3, 3 + TRACKING_BODY_LENGTH)) ===
    value.at(-1);
}
