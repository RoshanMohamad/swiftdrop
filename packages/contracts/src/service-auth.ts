import { createPrivateKey, randomUUID } from "node:crypto";
import { SignJWT } from "jose";

/** Signs a short-lived, event-bound worker credential for an internal lookup. */
export async function signServiceEventToken(input: {
  privateKey: string;
  keyId: string;
  serviceId: string;
  serviceKind: string;
  issuer: string;
  audience: string;
  scope: string;
  eventId: string;
  parcelId: string;
  now?: number;
}) {
  const signingKey = createPrivateKey(input.privateKey);
  if (
    signingKey.asymmetricKeyType !== "rsa" ||
    (signingKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw new Error(
      "Service signing requires an RSA key of at least 3072 bits.",
    );
  const now = input.now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({
    kid: input.keyId,
    serviceKind: input.serviceKind,
    eventId: input.eventId,
    parcelId: input.parcelId,
    scope: input.scope,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: input.keyId })
    .setSubject(input.serviceId)
    .setJti(randomUUID())
    .setIssuer(input.issuer)
    .setAudience(input.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(signingKey);
}
