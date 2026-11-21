import { createPrivateKey, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { z } from "zod";

export type WebhookTarget = { url: string; secret: string };

/** The persisted event a lookup is bound to (the service token carries both ids). */
export type WebhookLookupContext = { eventId: string; parcelId: string };

/**
 * Where a merchant's webhook URL and signing secret come from. Production implementation is
 * `HttpConfigSource`: core-api's internal listener, called with an event-bound service JWT
 * (plan X-11 / X-03).
 */
export interface WebhookConfigSource {
  /** Reloaded on every attempt, so a rotated secret or changed URL applies immediately. */
  get(
    merchantId: string,
    context: WebhookLookupContext,
  ): Promise<WebhookTarget | null>;
}

export class NoConfigSource implements WebhookConfigSource {
  async get() {
    return null;
  }
}

const fileSchema = z.record(
  z.uuid(),
  z.object({ url: z.string().min(1), secret: z.string().min(16) }).strict(),
);

/**
 * Development/test stand-in: a JSON file `{"<merchant uuid>": {"url", "secret"}}`.
 * `loadConfig` refuses to enable it in production.
 */
export class DevFileConfigSource implements WebhookConfigSource {
  constructor(private path: string) {}
  async get(merchantId: string) {
    const parsed = fileSchema.parse(
      JSON.parse(await readFile(this.path, "utf8")),
    );
    return parsed[merchantId] ?? null;
  }
}

/** Output of `pnpm services:provision --service webhook-svc` (signer.json). */
interface SignerMetadata {
  serviceId: string;
  serviceKind: string;
  issuer: string;
  audience: string;
  scope: string;
  keyId: string;
  privateKeyFile: string;
}

const responseSchema = z
  .object({ url: z.string().min(1), secret: z.string().min(16) })
  .strict();

export class ConfigLookupError extends Error {}

/**
 * X-11: read the merchant's webhook URL and signing secret from core-api's internal listener.
 * The token is signed per request, bound to the event and parcel, and lives five minutes. A 404
 * means "no usable configuration" (not configured, merchant unapproved or suspended) and is
 * returned as null; anything else throws so the attempt is recorded as CONFIG_UNAVAILABLE and
 * retried. The signer file is re-read each time so key rotation needs no restart.
 */
export class HttpConfigSource implements WebhookConfigSource {
  constructor(
    private options: {
      baseUrl: string;
      signerFile: string;
      timeoutMs?: number;
    },
  ) {}

  private async token({ eventId, parcelId }: WebhookLookupContext) {
    const meta = JSON.parse(
      await readFile(this.options.signerFile, "utf8"),
    ) as SignerMetadata;
    const key = createPrivateKey(await readFile(meta.privateKeyFile, "utf8"));
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      kid: meta.keyId,
      serviceKind: meta.serviceKind,
      eventId,
      parcelId,
      scope: meta.scope,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: meta.keyId })
      .setSubject(meta.serviceId)
      .setJti(randomUUID())
      .setIssuer(meta.issuer)
      .setAudience(meta.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(key);
  }

  async get(merchantId: string, context: WebhookLookupContext) {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/internal/v1/webhooks/merchants/${encodeURIComponent(merchantId)}/config?eventId=${context.eventId}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${await this.token(context)}` },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
        redirect: "error",
      });
    } catch {
      throw new ConfigLookupError("Webhook configuration is unavailable.");
    }
    if (response.status === 404) return null;
    if (!response.ok)
      throw new ConfigLookupError(
        `Webhook configuration lookup returned ${response.status}.`,
      );
    const parsed = responseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ConfigLookupError("Webhook configuration body is invalid.");
    return parsed.data;
  }
}
