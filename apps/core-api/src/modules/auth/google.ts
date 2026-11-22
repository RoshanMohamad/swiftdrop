import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import * as oidc from "openid-client";
import { emailSchema } from "@swiftdrop/contracts";

export type GoogleIdentity = {
  sub: string;
  email: string;
  fullName: string | null;
};
type GoogleConfig = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CALLBACK_URL?: string;
  oauthSecret: string;
};

export function encryptVerifier(value: string, secret: string) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}
export function decryptVerifier(value: string, secret: string) {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext)
    throw new Error("Invalid encrypted verifier.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
export class GoogleOidc {
  private configuration?: Promise<oidc.Configuration>;
  constructor(
    private config: GoogleConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}
  private boundedFetch: oidc.CustomFetch = (input, options) =>
    this.fetchImpl(input, {
      ...options,
      body: options.body as BodyInit,
      signal: AbortSignal.timeout(5000),
    });
  enabled() {
    return Boolean(
      this.config.GOOGLE_CLIENT_ID &&
      this.config.GOOGLE_CLIENT_SECRET &&
      this.config.GOOGLE_CALLBACK_URL,
    );
  }
  private client() {
    if (!this.enabled()) throw new Error("Google sign-in is not configured.");
    return (this.configuration ??= oidc
      .discovery(
        new URL("https://accounts.google.com"),
        this.config.GOOGLE_CLIENT_ID!,
        this.config.GOOGLE_CLIENT_SECRET!,
        undefined,
        { [oidc.customFetch]: this.boundedFetch },
      )
      .then((configuration) => {
        configuration[oidc.customFetch] = this.boundedFetch;
        configuration.timeout = 5;
        oidc.enableNonRepudiationChecks(configuration);
        return configuration;
      })
      .catch((error: unknown) => {
        // Never cache a failed discovery: one network blip must not disable
        // Google sign-in until the process restarts. The next request retries.
        this.configuration = undefined;
        throw error;
      }));
  }
  async authorizationUrl(state: string, nonce: string, verifier: string) {
    const client = await this.client();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    return oidc.buildAuthorizationUrl(client, {
      redirect_uri: this.config.GOOGLE_CALLBACK_URL!,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).href;
  }
  async exchange(
    url: URL,
    state: string,
    nonce: string,
    verifier: string,
  ): Promise<GoogleIdentity> {
    const client = await this.client();
    const response = await oidc.authorizationCodeGrant(client, url, {
      expectedState: state,
      expectedNonce: nonce,
      pkceCodeVerifier: verifier,
      idTokenExpected: true,
    });
    const claims = response.claims();
    const audienceValid =
      typeof claims?.aud === "string"
        ? claims.aud === this.config.GOOGLE_CLIENT_ID &&
          (claims.azp === undefined ||
            claims.azp === this.config.GOOGLE_CLIENT_ID)
        : Array.isArray(claims?.aud) &&
          claims.aud.includes(this.config.GOOGLE_CLIENT_ID!) &&
          claims.azp === this.config.GOOGLE_CLIENT_ID;
    if (
      !claims ||
      claims.iss !== "https://accounts.google.com" ||
      typeof claims.sub !== "string" ||
      claims.sub.length > 255 ||
      typeof claims.email !== "string" ||
      !(claims.email_verified === true || claims.email_verified === "true") ||
      !audienceValid
    )
      throw new Error("Google identity was not validated.");
    const email = emailSchema.parse(claims.email);
    const fullName =
      typeof claims.name === "string" &&
      claims.name.trim().length >= 2 &&
      claims.name.trim().length <= 120 &&
      !/\p{Cc}/u.test(claims.name)
        ? claims.name.trim()
        : null;
    return { sub: claims.sub, email, fullName };
  }
}
