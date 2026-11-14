import { createPrivateKey, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { notificationLookupResultSchema } from "@swiftdrop/contracts";
import type { Contact } from "./templates.js";

export class LookupError extends Error {
  constructor(
    public kind: "not_found" | "transient",
    message: string,
  ) {
    super(message);
  }
}

export interface ContactLookup {
  fetch(eventId: string, parcelId: string): Promise<Contact>;
}

/** Output of `pnpm services:provision --service notification-svc` (signer.json). */
interface SignerMetadata {
  serviceId: string;
  serviceKind: string;
  issuer: string;
  audience: string;
  scope: string;
  keyId: string;
  privateKeyFile: string;
}

/**
 * X-03: ask core-api's internal listener for the contact details of one persisted event. The
 * token is signed per request, bound to that event and parcel, and lives five minutes. The
 * signer file is re-read each time so key rotation needs no restart.
 */
export class HttpContactLookup implements ContactLookup {
  constructor(
    private options: {
      baseUrl: string;
      signerFile: string;
      timeoutMs?: number;
    },
  ) {}

  private async token(eventId: string, parcelId: string) {
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

  async fetch(eventId: string, parcelId: string): Promise<Contact> {
    let response: Response;
    try {
      response = await fetch(
        `${this.options.baseUrl.replace(/\/$/, "")}/internal/v1/notifications/events/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${await this.token(eventId, parcelId)}`,
          },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
        },
      );
    } catch {
      throw new LookupError("transient", "Contact lookup is unavailable.");
    }
    if (response.status === 404)
      throw new LookupError(
        "not_found",
        "No contact data exists for this event.",
      );
    if (!response.ok)
      throw new LookupError(
        "transient",
        `Contact lookup returned ${response.status}.`,
      );
    const parsed = notificationLookupResultSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      throw new LookupError(
        "transient",
        "Contact lookup returned an invalid body.",
      );
    return parsed.data;
  }
}
