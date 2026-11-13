import type { RequestHandler } from "express";
import type { MerchantApiClientScope, Principal } from "@swiftdrop/contracts";
import { HttpError, unauthorised } from "../../shared/problem.js";
import { OAuthProtocolError } from "./oauth-error.js";
import type { MerchantsService } from "./service.js";

export function authenticateMerchantClient(
  merchants: MerchantsService,
): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.get("authorization") ?? "");
    if (!match) return next(unauthorised());
    try {
      res.locals.principal = await merchants.authenticateOAuthToken(match[1]);
      next();
    } catch (error) {
      next(error instanceof OAuthProtocolError ? unauthorised() : error);
    }
  };
}

export function requireMerchantScope(
  ...required: MerchantApiClientScope[]
): RequestHandler {
  return (_req, res, next) => {
    const principal = res.locals.principal as Principal | undefined;
    if (principal?.kind !== "merchant-client")
      return next(
        new HttpError(
          403,
          "FORBIDDEN",
          "This action requires a merchant API client.",
        ),
      );
    if (required.some((scope) => !principal.scopes.includes(scope)))
      return next(
        new HttpError(
          403,
          "INSUFFICIENT_SCOPE",
          "The API client is missing a required scope.",
        ),
      );
    next();
  };
}
