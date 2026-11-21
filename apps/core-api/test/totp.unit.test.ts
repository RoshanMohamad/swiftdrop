import { describe, expect, it } from "@jest/globals";
import type { Database } from "@swiftdrop/db";
import {
  base32Decode,
  base32Encode,
  hotp,
  newTotpSecret,
  otpauthUri,
  totpAt,
  totpStep,
  verifyTotp,
} from "../src/modules/auth/totp.js";
import { MfaService } from "../src/modules/auth/mfa.js";

// RFC 4226 and RFC 6238 test secret: the ASCII string "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe("HOTP, RFC 4226 appendix D", () => {
  it("matches every published test vector", () => {
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expected.forEach((code, counter) =>
      expect(hotp(RFC_SECRET, counter)).toBe(code),
    );
  });
});

describe("TOTP, RFC 6238 appendix B (SHA-1)", () => {
  it("matches the published 8 digit vectors at each test time", () => {
    const vectors: Array<[number, string]> = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [seconds, code] of vectors)
      expect(hotp(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(code);
  });

  it("gives the 6 digit code authenticator apps show for the same secret and time", () => {
    // The last six digits of the 8 digit vector, which is how a 6 digit code is derived.
    expect(totpAt(RFC_SECRET_B32, 59_000)).toBe("287082");
    expect(totpAt(RFC_SECRET_B32, 1111111109_000)).toBe("081804");
  });
});

describe("base32 (RFC 4648 section 10)", () => {
  it("encodes and decodes the published vectors", () => {
    const vectors: Array<[string, string]> = [
      ["f", "MY"],
      ["fo", "MZXQ"],
      ["foo", "MZXW6"],
      ["foob", "MZXW6YQ"],
      ["fooba", "MZXW6YTB"],
      ["foobar", "MZXW6YTBOI"],
    ];
    for (const [plain, encoded] of vectors) {
      expect(base32Encode(Buffer.from(plain))).toBe(encoded);
      expect(base32Decode(encoded).toString()).toBe(plain);
    }
  });

  it("is lenient about case, spaces and padding but refuses other characters", () => {
    expect(base32Decode("mzxw 6ytb oi======").toString()).toBe("foobar");
    expect(() => base32Decode("MZXW1")).toThrow();
    expect(() => base32Decode("MZXW-")).toThrow();
  });

  it("generates 160 bit secrets as 32 base32 characters", () => {
    const secrets = new Set(Array.from({ length: 200 }, newTotpSecret));
    expect(secrets.size).toBe(200);
    for (const secret of secrets) {
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(base32Decode(secret)).toHaveLength(20);
    }
  });
});

describe("verifyTotp", () => {
  const now = 1_700_000_000_000;
  const at = (offsetSteps: number) => totpAt(RFC_SECRET_B32, now + offsetSteps * 30_000);

  it("accepts the current code and one step of clock drift either way", () => {
    for (const offset of [-1, 0, 1])
      expect(verifyTotp(RFC_SECRET_B32, at(offset), now)).toEqual({
        ok: true,
        step: totpStep(now) + offset,
      });
  });

  it("refuses codes two or more steps away, wrong codes and anything not 6 digits", () => {
    expect(verifyTotp(RFC_SECRET_B32, at(2), now).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, at(-2), now).ok).toBe(false);
    for (const bad of ["", "12345", "1234567", "abcdef", " 123456", "123 456", "000000x"])
      expect(verifyTotp(RFC_SECRET_B32, bad, now).ok).toBe(false);
  });

  it("never accepts a step at or before the last used one (no replay)", () => {
    const current = totpStep(now);
    expect(
      verifyTotp(RFC_SECRET_B32, at(0), now, { lastUsedStep: current }).ok,
    ).toBe(false);
    // An older code inside the window is also refused once a newer one was used.
    expect(
      verifyTotp(RFC_SECRET_B32, at(-1), now, { lastUsedStep: current }).ok,
    ).toBe(false);
    // A code for a later step is still fine.
    expect(
      verifyTotp(RFC_SECRET_B32, at(1), now, { lastUsedStep: current }),
    ).toEqual({ ok: true, step: current + 1 });
    expect(
      verifyTotp(RFC_SECRET_B32, at(0), now, { lastUsedStep: current - 1 }).ok,
    ).toBe(true);
  });

  it("a different secret never validates", () => {
    expect(verifyTotp(newTotpSecret(), at(0), now).ok).toBe(false);
  });
});

describe("otpauth URI", () => {
  it("carries the secret, issuer and the parameters every app supports", () => {
    const uri = otpauthUri(RFC_SECRET_B32, "a.b+c@example.test", "SwiftDrop");
    const url = new URL(uri);
    expect(url.protocol).toBe("otpauth:");
    expect(url.host).toBe("totp");
    expect(decodeURIComponent(url.pathname)).toBe("/SwiftDrop:a.b+c@example.test");
    expect(url.searchParams.get("secret")).toBe(RFC_SECRET_B32);
    expect(url.searchParams.get("issuer")).toBe("SwiftDrop");
    expect(url.searchParams.get("algorithm")).toBe("SHA1");
    expect(url.searchParams.get("digits")).toBe("6");
    expect(url.searchParams.get("period")).toBe("30");
  });
});

describe("TOTP secret encryption at rest", () => {
  const service = (secret: string, version = 1) =>
    new MfaService({} as Database, {
      mfaSecret: secret,
      MFA_KEY_VERSION: version,
      MFA_REQUIRED_ROLES: [],
    });
  const root = "m".repeat(64);

  it("round-trips, never stores the secret in the clear and uses a fresh nonce each time", () => {
    const mfa = service(root);
    const secret = newTotpSecret();
    const a = mfa.encryptSecret(secret);
    const b = mfa.encryptSecret(secret);
    expect(a.encryptedSecret).not.toBe(b.encryptedSecret);
    expect(a.encryptedSecret).not.toContain(secret);
    expect(a.keyVersion).toBe(1);
    expect(mfa.decryptSecret(a.encryptedSecret, a.keyVersion)).toBe(secret);
  });

  it("fails closed for the wrong key, wrong version, tampering and malformed values", () => {
    const mfa = service(root);
    const sealed = mfa.encryptSecret(newTotpSecret());
    expect(() => service("n".repeat(64)).decryptSecret(sealed.encryptedSecret, 1)).toThrow();
    expect(() => mfa.decryptSecret(sealed.encryptedSecret, 2)).toThrow();
    const [iv, tag, data] = sealed.encryptedSecret.split(".");
    expect(() => mfa.decryptSecret(`${iv}.${tag}.${Buffer.from("x").toString("base64url")}`, 1)).toThrow();
    expect(() => mfa.decryptSecret(`${iv}.${data}.${data}`, 1)).toThrow();
    expect(() => mfa.decryptSecret("garbage", 1)).toThrow();
    expect(() => mfa.decryptSecret("", 1)).toThrow();
  });

  it("records the key version it was sealed with", () => {
    expect(service(root, 3).encryptSecret("ABC").keyVersion).toBe(3);
  });
});
