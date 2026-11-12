import express, { Router, type ErrorRequestHandler } from "express";
import {
  merchantApiClientScopeSchema,
  type MerchantApiClientScope,
} from "@swiftdrop/contracts";
import type { Logger } from "pino";
import type { RateLimiter } from "../../shared/rate-limit.js";
import { OAuthProtocolError } from "./oauth-error.js";
import type { MerchantsService } from "./service.js";

const clientIdPattern = /^sd_cli_[A-Za-z0-9_-]{24}$/;
const clientSecretPattern = /^sd_sec_[A-Za-z0-9_-]{43}$/;

function oauthError(
  res: express.Response,
  code: string,
  status: number,
  description: string,
) {
  res
    .status(status)
    .type("application/json")
    .json({ error: code, error_description: description });
}

function basicCredentials(header: string | undefined) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? "");
  if (!match) return null;
  const encoded = match[1];
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")
  )
    return null;
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 1) return null;
  const clientId = decoded.slice(0, separator);
  const clientSecret = decoded.slice(separator + 1);
  if (
    !clientIdPattern.test(clientId) ||
    !clientSecretPattern.test(clientSecret)
  )
    return null;
  return { clientId, clientSecret };
}

export function createMerchantOAuthRouter(
  merchants: MerchantsService,
  limiter: RateLimiter,
  logger: Logger,
) {
  const router = Router();
  router.use("/oauth/token", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  });
  router.post(
    "/oauth/token",
    async (req, res, next) => {
      try {
        const ipLimit = await limiter.hit(`oauth-token:ip:${req.ip}`, 120, 60);
        if (ipLimit.blocked) {
          res.setHeader("Retry-After", ipLimit.retryAfter);
          oauthError(
            res,
            "temporarily_unavailable",
            429,
            "Too many token requests. Retry after the indicated delay.",
          );
          return;
        }
        next();
      } catch (error) {
        next(error);
      }
    },
    express.urlencoded({
      extended: false,
      limit: "8kb",
      parameterLimit: 5,
      type: "application/x-www-form-urlencoded",
    }),
    async (req, res, next) => {
      try {
        if (!req.is("application/x-www-form-urlencoded"))
          throw new OAuthProtocolError(
            "invalid_request",
            400,
            "Send the token request as application/x-www-form-urlencoded.",
          );
        const body = req.body as Record<string, unknown> | undefined;
        if (
          !body ||
          Array.isArray(body.grant_type) ||
          Array.isArray(body.scope) ||
          Object.keys(body).some(
            (key) => !["grant_type", "scope"].includes(key),
          ) ||
          "client_id" in body ||
          "client_secret" in body
        )
          throw new OAuthProtocolError(
            "invalid_request",
            400,
            "The token request is malformed.",
          );
        if (body.grant_type === undefined)
          throw new OAuthProtocolError(
            "invalid_request",
            400,
            "The grant_type parameter is required.",
          );
        if (body.grant_type !== "client_credentials")
          throw new OAuthProtocolError(
            "unsupported_grant_type",
            400,
            "Only the client_credentials grant is supported.",
          );

        const credentials = basicCredentials(req.get("authorization"));
        if (!credentials) {
          res.setHeader("WWW-Authenticate", 'Basic realm="oauth/token"');
          throw new OAuthProtocolError(
            "invalid_client",
            401,
            "Client authentication failed.",
          );
        }
        if (await merchants.hasOAuthClient(credentials.clientId)) {
          const clientLimit = await limiter.hit(
            `oauth-token:client:${credentials.clientId}`,
            30,
            60,
          );
          if (clientLimit.blocked) {
            res.setHeader("Retry-After", clientLimit.retryAfter);
            oauthError(
              res,
              "temporarily_unavailable",
              429,
              "Too many token requests for this client. Retry after the indicated delay.",
            );
            return;
          }
        }

        let scopes: MerchantApiClientScope[] | undefined;
        if (body.scope !== undefined) {
          if (
            typeof body.scope !== "string" ||
            !body.scope.trim() ||
            body.scope.length > 200
          )
            throw new OAuthProtocolError(
              "invalid_scope",
              400,
              "The requested scope is invalid.",
            );
          const parts = body.scope.split(" ");
          if (
            parts.some(
              (part) =>
                !part || !merchantApiClientScopeSchema.safeParse(part).success,
            ) ||
            new Set(parts).size !== parts.length
          )
            throw new OAuthProtocolError(
              "invalid_scope",
              400,
              "The requested scope is invalid.",
            );
          scopes = parts as MerchantApiClientScope[];
        }
        res.json(
          await merchants.issueOAuthToken(
            credentials.clientId,
            credentials.clientSecret,
            scopes,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof OAuthProtocolError) {
      if (error.retryAfter) res.setHeader("Retry-After", error.retryAfter);
      if (error.code === "invalid_client")
        res.setHeader("WWW-Authenticate", 'Basic realm="oauth/token"');
      return oauthError(res, error.code, error.status, error.message);
    }
    logger.error({
      correlationId: res.locals.correlationId,
      event: "oauth_token_request_failed",
    });
    const status =
      error instanceof Error && "status" in error ? error.status : undefined;
    if (status === 400 || status === 413 || status === 415)
      return oauthError(
        res,
        "invalid_request",
        400,
        "The token request is malformed.",
      );
    const unavailable = status === 503;
    return oauthError(
      res,
      unavailable ? "temporarily_unavailable" : "server_error",
      unavailable ? 503 : 500,
      unavailable
        ? "The token service is temporarily unavailable."
        : "The token request could not be completed.",
    );
  };
  router.use(errors);
  return router;
}
