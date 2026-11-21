import { beforeAll, describe, expect, it } from "@jest/globals";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import {
  MERCHANT_AUDIENCE,
  createTokenService,
  type TokenService,
} from "../src/modules/auth/jwt.js";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  newWebhookSecret,
  validateMerchantWebhookUrl,
} from "../src/modules/merchants/webhook-security.js";
import { HttpError } from "../src/shared/problem.js";

const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const privateKey = pair.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const publicKey = pair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const settings = {
  privateKey,
  publicKeys: { k1: publicKey },
  AUTH_KEY_ID: "k1",
  API_ISSUER: "https://issuer.example.test",
  HUMAN_AUDIENCE: "swiftdrop-human",
};
const CLIENT = "sd_cli_AAAAAAAAAAAAAAAAAAAAAAAA";

describe("merchant webhook URL validation (SSRF, DD §9.3)", () => {
  const rejected = async (url: string) => {
    const error = await validateMerchantWebhookUrl(url).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 422, code: "UNSAFE_WEBHOOK_URL" });
  };

  it("accepts a public HTTPS address", async () => {
    expect(await validateMerchantWebhookUrl("https://8.8.8.8/hook")).toBe(
      "https://8.8.8.8/hook",
    );
  });

  it("refuses plain HTTP, credentials, fragments and malformed URLs", async () => {
    await rejected("http://8.8.8.8/hook");
    await rejected("https://user:pass@8.8.8.8/hook");
    await rejected("https://8.8.8.8/hook#frag");
    await rejected("not a url");
    await rejected("ftp://8.8.8.8/hook");
  });

  it("refuses local-only host names", async () => {
    for (const host of [
      "localhost",
      "api.localhost",
      "printer.local",
      "db.internal",
      "router.home.arpa",
    ])
      await rejected(`https://${host}/hook`);
  });

  it("refuses private, loopback, link-local, CGNAT, metadata and mapped addresses", async () => {
    for (const host of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.9",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "[::1]",
      "[fe80::1]",
      "[fd00::1]",
      "[::ffff:8.8.8.8]",
      "[64:ff9b::808:808]",
    ])
      await rejected(`https://${host}/hook`);
  });
});

describe("webhook signing secret at rest", () => {
  it("round-trips, and each encryption is different", () => {
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^sd_whsec_[A-Za-z0-9_-]{43}$/);
    const a = encryptWebhookSecret(secret, "root-secret-one");
    const b = encryptWebhookSecret(secret, "root-secret-one");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain(secret);
    expect(decryptWebhookSecret(a, "root-secret-one")).toBe(secret);
  });

  it("refuses the wrong root secret, tampering and malformed values", () => {
    const stored = encryptWebhookSecret("sd_whsec_value", "root-secret-one");
    expect(() => decryptWebhookSecret(stored, "root-secret-two")).toThrow();
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptWebhookSecret(parts.join("."), "root-secret-one")).toThrow();
    expect(() => decryptWebhookSecret("v2.a.b.c", "root-secret-one")).toThrow();
    expect(() => decryptWebhookSecret("garbage", "root-secret-one")).toThrow();
  });
});

describe("token service (RS256, DD §9.1 and merchant client tokens)", () => {
  let tokens: TokenService;
  beforeAll(async () => {
    tokens = await createTokenService(settings);
  });

  const forge = async (
    claims: Record<string, unknown>,
    options: {
      audience?: string;
      issuer?: string;
      kid?: string;
      subject?: string;
      lifetime?: number;
      issuedAt?: number;
    } = {},
  ) => {
    const now = options.issuedAt ?? Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "k1", typ: "JWT" })
      .setSubject(options.subject ?? "7")
      .setJti(randomUUID())
      .setIssuer(options.issuer ?? settings.API_ISSUER)
      .setAudience(options.audience ?? settings.HUMAN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + (options.lifetime ?? 900))
      .sign(await importPKCS8(privateKey, "RS256"));
  };

  it("issues and verifies a 15-minute human token with only id, role and jti", async () => {
    const { accessToken, jti, expiresAt } = await tokens.issue(7, "COURIER");
    expect(await tokens.verify(accessToken)).toEqual({
      id: 7,
      role: "COURIER",
      jti,
    });
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900_000);
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1]!, "base64url").toString(),
    );
    expect(Object.keys(payload).sort()).toEqual(
      ["aud", "exp", "iat", "iss", "jti", "role", "sub"].sort(),
    );
  });

  it("rejects human tokens that are forged, mistimed or mis-addressed", async () => {
    const bad = [
      await forge({ role: "ADMIN" }, { issuer: "https://evil.example.test" }),
      await forge({ role: "ADMIN" }, { audience: "someone-else" }),
      await forge({ role: "ADMIN" }, { kid: "unknown" }),
      await forge({ role: "ADMIN" }, { subject: "abc" }),
      await forge({ role: "ADMIN" }, { subject: "0" }),
      await forge({ role: "ROOT" }),
      await forge({ role: "ADMIN" }, { lifetime: 3600 }),
      await forge({ role: "ADMIN" }, { issuedAt: Math.floor(Date.now() / 1000) + 600 }),
      await forge({ role: "ADMIN" }, { issuedAt: Math.floor(Date.now() / 1000) - 7200 }),
      "not.a.jwt",
    ];
    for (const token of bad)
      await expect(tokens.verify(token)).rejects.toMatchObject({ status: 401 });
    const good = (await tokens.issue(1, "ADMIN")).accessToken;
    const tampered = `${good.slice(0, -4)}AAAA`;
    await expect(tokens.verify(tampered)).rejects.toMatchObject({ status: 401 });
  });

  it("issues merchant tokens bound to a client and never accepts them as human tokens", async () => {
    const issued = await tokens.issueMerchantClient(CLIENT, ["orders:write"]);
    expect(await tokens.verifyMerchantClient(issued.accessToken)).toEqual({
      clientId: CLIENT,
      jti: issued.jti,
      scopes: ["orders:write"],
    });
    await expect(tokens.verify(issued.accessToken)).rejects.toMatchObject({
      status: 401,
    });
    // ... and a human token is not a machine token.
    const human = (await tokens.issue(7, "ADMIN")).accessToken;
    await expect(tokens.verifyMerchantClient(human)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("refuses to issue merchant tokens without unique, known scopes", async () => {
    await expect(tokens.issueMerchantClient(CLIENT, [])).rejects.toThrow();
    await expect(
      tokens.issueMerchantClient(CLIENT, ["orders:read", "orders:read"]),
    ).rejects.toThrow();
    await expect(
      tokens.issueMerchantClient(CLIENT, ["admin:everything"]),
    ).rejects.toThrow();
  });

  it("rejects malformed merchant tokens", async () => {
    const claims = { kind: "merchant-client", scope: "orders:read" };
    const opts = { audience: MERCHANT_AUDIENCE, subject: CLIENT };
    const bad = [
      await forge({ ...claims, kind: "user" }, opts),
      await forge({ ...claims, scope: "orders:read orders:read" }, opts),
      await forge({ ...claims, scope: "orders:read admin" }, opts),
      await forge({ ...claims, scope: "" }, opts),
      await forge({ kind: "merchant-client" }, opts),
      await forge(claims, { ...opts, subject: "not-a-client" }),
      await forge(claims, { ...opts, lifetime: 60 }),
      await forge(claims, { ...opts, issuer: "https://evil.example.test" }),
      await forge(claims, { ...opts, audience: settings.HUMAN_AUDIENCE }),
    ];
    for (const token of bad)
      await expect(tokens.verifyMerchantClient(token)).rejects.toMatchObject({
        status: 401,
      });
  });

  it("refuses weak or mismatched signing keys at start-up", async () => {
    const small = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const smallPrivate = small.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const smallPublic = small.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    await expect(
      createTokenService({
        ...settings,
        privateKey: smallPrivate,
        publicKeys: { k1: smallPublic },
      }),
    ).rejects.toThrow(/3072/);
    await expect(
      createTokenService({ ...settings, AUTH_KEY_ID: "missing" }),
    ).rejects.toThrow(/trusted/);
    const other = generateKeyPairSync("rsa", { modulusLength: 3072 })
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    await expect(
      createTokenService({ ...settings, publicKeys: { k1: other } }),
    ).rejects.toThrow(/match/);
  });

  it("keeps verifying tokens signed with a retired key that is still trusted", async () => {
    const old = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const oldService = await createTokenService({
      ...settings,
      privateKey: old.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeys: {
        k0: old.publicKey.export({ type: "spki", format: "pem" }).toString(),
      },
      AUTH_KEY_ID: "k0",
    });
    const token = (await oldService.issue(3, "CUSTOMER")).accessToken;
    const rotated = await createTokenService({
      ...settings,
      publicKeys: {
        k1: publicKey,
        k0: old.publicKey.export({ type: "spki", format: "pem" }).toString(),
      },
    });
    expect(await rotated.verify(token)).toMatchObject({ id: 3, role: "CUSTOMER" });
    // The signing-only service does not trust the new key.
    await expect(
      oldService.verify((await rotated.issue(3, "CUSTOMER")).accessToken),
    ).rejects.toMatchObject({ status: 401 });
  });
});
