import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import {
  merchantApiClientScopeSchema,
  roleSchema,
  type Role,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { unauthorised } from "../../shared/problem.js";
export const MERCHANT_AUDIENCE = "swiftdrop-merchant-api";
export async function createTokenService(
  config: Pick<
    Config,
    | "privateKey"
    | "publicKeys"
    | "AUTH_KEY_ID"
    | "API_ISSUER"
    | "HUMAN_AUDIENCE"
  >,
) {
  const assertRSA = (pem: string) => {
    const key = pem.includes("PRIVATE")
      ? createPrivateKey(pem)
      : createPublicKey(pem);
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
    )
      throw new Error("RS256 requires an RSA key of at least 3072 bits.");
  };
  assertRSA(config.privateKey);
  const signingKey = await importPKCS8(config.privateKey, "RS256");
  const keys = new Map(
    await Promise.all(
      Object.entries(config.publicKeys).map(async ([kid, pem]) => {
        assertRSA(pem);
        return [kid, await importSPKI(pem, "RS256")] as const;
      }),
    ),
  );
  if (!keys.has(config.AUTH_KEY_ID))
    throw new Error("Signing key ID is not trusted.");
  const currentPublic = createPublicKey(config.privateKey).export({
    type: "spki",
    format: "pem",
  });
  if (
    currentPublic !==
    createPublicKey(config.publicKeys[config.AUTH_KEY_ID]).export({
      type: "spki",
      format: "pem",
    })
  )
    throw new Error("Signing key does not match the configured public key.");
  return {
    async issue(id: number, role: Role) {
      const jti = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const accessToken = await new SignJWT({ role })
        .setProtectedHeader({
          alg: "RS256",
          kid: config.AUTH_KEY_ID,
          typ: "JWT",
        })
        .setSubject(String(id))
        .setJti(jti)
        .setIssuer(config.API_ISSUER)
        .setAudience(config.HUMAN_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + 900)
        .sign(signingKey);
      return { accessToken, jti, expiresAt: new Date((now + 900) * 1000) };
    },
    async issueMerchantClient(clientId: string, scopes: string[]) {
      const parsedScopes = scopes.map((scope) =>
        merchantApiClientScopeSchema.parse(scope),
      );
      if (
        parsedScopes.length === 0 ||
        new Set(parsedScopes).size !== parsedScopes.length
      )
        throw new Error("Merchant tokens require unique granted scopes.");
      const jti = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const accessToken = await new SignJWT({
        kind: "merchant-client",
        scope: parsedScopes.join(" "),
      })
        .setProtectedHeader({
          alg: "RS256",
          kid: config.AUTH_KEY_ID,
          typ: "JWT",
        })
        .setSubject(clientId)
        .setJti(jti)
        .setIssuer(config.API_ISSUER)
        .setAudience(MERCHANT_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + 900)
        .sign(signingKey);
      return { accessToken, jti, expiresAt: new Date((now + 900) * 1000) };
    },
    async verify(token: string) {
      try {
        const { payload } = await jwtVerify(
          token,
          (header) => {
            const key = keys.get(header.kid ?? "");
            if (!key) throw unauthorised();
            return key;
          },
          {
            algorithms: ["RS256"],
            issuer: config.API_ISSUER,
            audience: config.HUMAN_AUDIENCE,
            typ: "JWT",
            requiredClaims: ["sub", "role", "jti", "iat", "exp"],
          },
        );
        if (
          !/^\d+$/.test(payload.sub ?? "") ||
          !Number.isSafeInteger(Number(payload.sub)) ||
          Number(payload.sub) < 1 ||
          !payload.jti ||
          !/^[0-9a-f-]{36}$/i.test(payload.jti) ||
          typeof payload.iat !== "number" ||
          typeof payload.exp !== "number" ||
          payload.exp - payload.iat !== 900 ||
          payload.iat > Math.floor(Date.now() / 1000)
        )
          throw unauthorised();
        return {
          id: Number(payload.sub),
          role: roleSchema.parse(payload.role),
          jti: payload.jti,
        };
      } catch {
        throw unauthorised();
      }
    },
    async verifyMerchantClient(token: string) {
      try {
        const { payload } = await jwtVerify(
          token,
          (header) => {
            const key = keys.get(header.kid ?? "");
            if (!key) throw unauthorised();
            return key;
          },
          {
            algorithms: ["RS256"],
            issuer: config.API_ISSUER,
            audience: MERCHANT_AUDIENCE,
            typ: "JWT",
            requiredClaims: ["sub", "jti", "iat", "exp", "kind", "scope"],
          },
        );
        if (
          payload.kind !== "merchant-client" ||
          !/^sd_cli_[A-Za-z0-9_-]{24}$/.test(payload.sub ?? "") ||
          !payload.jti ||
          !/^[0-9a-f-]{36}$/i.test(payload.jti) ||
          typeof payload.iat !== "number" ||
          typeof payload.exp !== "number" ||
          payload.exp - payload.iat !== 900 ||
          payload.iat > Math.floor(Date.now() / 1000) ||
          typeof payload.scope !== "string"
        )
          throw unauthorised();
        const scopes = payload.scope.split(" ");
        if (
          scopes.length === 0 ||
          scopes.some(
            (scope) => !merchantApiClientScopeSchema.safeParse(scope).success,
          ) ||
          new Set(scopes).size !== scopes.length
        )
          throw unauthorised();
        return { clientId: payload.sub, jti: payload.jti, scopes };
      } catch {
        throw unauthorised();
      }
    },
  };
}
export type TokenService = Awaited<ReturnType<typeof createTokenService>>;
