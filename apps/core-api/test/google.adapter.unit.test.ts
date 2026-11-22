import { describe, expect, it } from "@jest/globals";
import { generateKeyPairSync } from "node:crypto";
import { exportJWK, importPKCS8, importSPKI, SignJWT } from "jose";
import { GoogleOidc } from "../src/modules/auth/google.js";

const clientId = "swift-test-client.apps.googleusercontent.com";
const verifier = "very-long-pkce-verifier-for-local-oidc-tests-only";
const state = "expected-state";
const nonce = "expected-nonce";
const callback = new URL(
  `http://localhost:5173/api/v1/auth/google/callback?code=fixture&state=${state}`,
);
let fixtureNumber = 0;

async function fixture(
  overrides: Record<string, unknown> = {},
  invalidSignature = false,
) {
  const jwksUrl = `https://fixture.test/jwks/${++fixtureNumber}`;
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = await importPKCS8(
    pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    "RS256",
  );
  const publicKey = await importSPKI(
    pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    "RS256",
  );
  const jwk = await exportJWK(
    invalidSignature
      ? await importSPKI(
          generateKeyPairSync("rsa", { modulusLength: 2048 })
            .publicKey.export({ type: "spki", format: "pem" })
            .toString(),
          "RS256",
        )
      : publicKey,
  );
  jwk.kid = "fixture-key";
  jwk.use = "sig";
  jwk.alg = "RS256";
  const claims = {
    sub: "google-user-1",
    email: "customer@example.test",
    email_verified: true,
    name: "Example Customer",
    nonce,
    ...overrides,
  };
  const issuer =
    typeof overrides.iss === "string"
      ? overrides.iss
      : "https://accounts.google.com";
  const audience =
    typeof overrides.aud === "string" || Array.isArray(overrides.aud)
      ? (overrides.aud as string | string[])
      : clientId;
  const signedToken = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(typeof overrides.exp === "number" ? overrides.exp : "5m")
    .sign(privateKey);
  const idToken = invalidSignature
    ? `${signedToken.slice(0, signedToken.lastIndexOf(".") + 1)}AAAA`
    : signedToken;
  const requested: string[] = [];
  const fetchFixture: typeof fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    requested.push(url);
    if (url.includes(".well-known/openid-configuration"))
      return Response.json({
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://fixture.test/token",
        jwks_uri: jwksUrl,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        grant_types_supported: ["authorization_code"],
      });
    if (url === jwksUrl) return Response.json({ keys: [jwk] });
    if (url === "https://fixture.test/token") {
      const body = options?.body;
      const form =
        body instanceof URLSearchParams
          ? body
          : new URLSearchParams(String(body ?? ""));
      if (form.get("code_verifier") !== verifier)
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({
        access_token: "fixture-access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token: idToken,
      });
    }
    throw new Error(`Unexpected OIDC request to ${url}`);
  };
  const client = new GoogleOidc(
    {
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: "fixture-secret",
      GOOGLE_CALLBACK_URL: "http://localhost:5173/api/v1/auth/google/callback",
      oauthSecret: "x".repeat(64),
    },
    fetchFixture,
  );
  return { client, claims, requested, jwksUrl, fetchFixture };
}

async function authorize(value: Awaited<ReturnType<typeof fixture>>) {
  await value.client.authorizationUrl(state, nonce, verifier);
  return value.client.exchange(callback, state, nonce, verifier);
}

describe("Google OIDC adapter protocol", () => {
  it("validates a signed ID token through discovery, JWKS, state, nonce and PKCE", async () => {
    const value = await fixture();
    await expect(authorize(value)).resolves.toEqual({
      sub: "google-user-1",
      email: "customer@example.test",
      fullName: "Example Customer",
    });
  });

  it.each([
    ["issuer", { iss: "https://evil.example" }],
    ["audience", { aud: "another-client" }],
    [
      "authorized party",
      { aud: [clientId, "another-client"], azp: "another-client" },
    ],
    ["email verification", { email_verified: false }],
    ["expiry", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["nonce", { nonce: "different-nonce" }],
  ])("rejects an ID token with the wrong %s", async (_label, claims) => {
    const value = await fixture(claims);
    await expect(authorize(value)).rejects.toThrow();
  });

  it("rejects an invalid signature and a mismatched OAuth state", async () => {
    const badSignature = await fixture({}, true);
    await expect(authorize(badSignature)).rejects.toThrow();
    expect(badSignature.requested).toContain(badSignature.jwksUrl);
    const wrongState = await fixture();
    await wrongState.client.authorizationUrl(state, nonce, verifier);
    await expect(
      wrongState.client.exchange(
        new URL(callback.href.replace(state, "different-state")),
        state,
        nonce,
        verifier,
      ),
    ).rejects.toThrow();
  });

  it("rejects a PKCE verifier the provider does not accept", async () => {
    const value = await fixture();
    await value.client.authorizationUrl(state, nonce, verifier);
    await expect(
      value.client.exchange(callback, state, nonce, `${verifier}-wrong`),
    ).rejects.toThrow();
  });

  it("retries discovery after a failed attempt instead of caching the failure", async () => {
    const { fetchFixture } = await fixture();
    let failNext = true;
    const client = new GoogleOidc(
      {
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: "fixture-secret",
        GOOGLE_CALLBACK_URL:
          "http://localhost:5173/api/v1/auth/google/callback",
        oauthSecret: "x".repeat(64),
      },
      async (input, options) => {
        if (failNext) {
          failNext = false;
          throw new TypeError("fetch failed");
        }
        return fetchFixture(input, options);
      },
    );
    await expect(
      client.authorizationUrl(state, nonce, verifier),
    ).rejects.toThrow();
    await expect(
      client.authorizationUrl(state, nonce, verifier),
    ).resolves.toContain("https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("bounds discovery and token requests", async () => {
    const client = new GoogleOidc(
      {
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: "fixture-secret",
        GOOGLE_CALLBACK_URL:
          "http://localhost:5173/api/v1/auth/google/callback",
        oauthSecret: "x".repeat(64),
      },
      async () => {
        throw new DOMException("Timed out", "TimeoutError");
      },
    );
    await expect(
      client.authorizationUrl(state, nonce, verifier),
    ).rejects.toThrow();
  });
});
