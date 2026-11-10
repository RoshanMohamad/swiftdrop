import { createPublicKey } from "node:crypto";
import { importSPKI, jwtVerify, decodeProtectedHeader } from "jose";
import type { RequestHandler } from "express";
import type { Database } from "@swiftdrop/db";
import type { Config } from "../../shared/config.js";
import { HttpError } from "../../shared/problem.js";

const unauthorized = () =>
  new HttpError(401, "UNAUTHENTICATED", "Service credentials are invalid.");

export function createServiceAuthenticator(
  db: Database,
  config: Config,
  clock: () => Date = () => new Date(),
): RequestHandler {
  const humanKeys = new Set(
    Object.values(config.publicKeys ?? {}).map((pem) =>
      createPublicKey(pem).export({ type: "spki", format: "pem" }).toString(),
    ),
  );
  return async (req, res, next) => {
    let readingKey = false;
    try {
      const authorization = req.get("authorization");
      if (
        !authorization ||
        authorization.length > 8192 ||
        !/^Bearer \S+$/i.test(authorization)
      )
        throw unauthorized();
      const token = authorization.slice(7);
      const header = decodeProtectedHeader(token);
      if (
        header.alg !== "RS256" ||
        header.typ !== "JWT" ||
        !header.kid ||
        header.jku ||
        header.x5u
      )
        throw unauthorized();

      readingKey = true;
      const keyRecord = await db.servicePublicKey.findUnique({
        where: { keyId: header.kid },
        include: { principal: true },
      });
      readingKey = false;
      if (!keyRecord) throw unauthorized();
      const publicKey = createPublicKey(keyRecord.publicKeyPem);
      if (
        publicKey.asymmetricKeyType !== "rsa" ||
        (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072 ||
        humanKeys.has(
          publicKey.export({ type: "spki", format: "pem" }).toString(),
        )
      )
        throw unauthorized();
      const currentTime = clock();
      const { payload } = await jwtVerify(
        token,
        await importSPKI(keyRecord.publicKeyPem, "RS256"),
        {
          algorithms: ["RS256"],
          issuer: config.SERVICE_ISSUER,
          audience: keyRecord.principal.audience,
          typ: "JWT",
          clockTolerance: 30,
          currentDate: currentTime,
          requiredClaims: [
            "sub",
            "serviceKind",
            "aud",
            "iss",
            "kid",
            "jti",
            "iat",
            "exp",
            "eventId",
            "parcelId",
            "scope",
          ],
        },
      );
      const now = currentTime.getTime();
      const nowSeconds = Math.floor(now / 1000);
      if (
        payload.sub !== keyRecord.serviceId ||
        payload.kid !== header.kid ||
        payload.serviceKind !== keyRecord.principal.serviceKind ||
        payload.iss !== config.SERVICE_ISSUER ||
        payload.aud !== keyRecord.principal.audience ||
        typeof payload.jti !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(payload.jti) ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 300 ||
        payload.iat > nowSeconds + 30 ||
        typeof payload.eventId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(payload.eventId) ||
        typeof payload.parcelId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(payload.parcelId) ||
        typeof payload.scope !== "string"
      )
        throw unauthorized();
      if (
        keyRecord.principal.revokedAt ||
        keyRecord.revokedAt ||
        keyRecord.notBefore.getTime() > now ||
        (keyRecord.notAfter && keyRecord.notAfter.getTime() <= now)
      )
        throw unauthorized();
      const granted = new Set(keyRecord.principal.permissions);
      const signed = new Set(payload.scope.split(/\s+/).filter(Boolean));
      if ([...signed].some((scope) => !granted.has(scope)))
        throw unauthorized();
      if (!signed.has("notifications:lookup"))
        throw new HttpError(
          403,
          "FORBIDDEN",
          "This service is not allowed to perform this lookup.",
        );
      res.locals.service = {
        id: keyRecord.serviceId,
        kind: keyRecord.principal.serviceKind,
        eventId: payload.eventId,
        parcelId: payload.parcelId,
      };
      next();
    } catch (error) {
      if (error instanceof HttpError) next(error);
      else if (readingKey) next(error);
      else next(unauthorized());
    }
  };
}
