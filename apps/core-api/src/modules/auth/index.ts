import type { RequestHandler } from "express";
import type { Role } from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import type { AuthService } from "./service.js";
export function authenticate(service: AuthService): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await service.authenticate(req.get("authorization"));
      // Roles that must have a second factor may use only the auth routes (to enrol one) until
      // they do (auth plan 4.7). Checked per request, so enrolment takes effect at once.
      if (
        !(req.originalUrl ?? "").startsWith("/api/v1/auth/") &&
        (await service.mfaEnrolmentRequired(result.user.id, result.user.role))
      )
        throw new HttpError(
          403,
          "MFA_ENROLMENT_REQUIRED",
          "Set up a second factor in Security settings to use this feature.",
        );
      res.locals.user = result.user;
      res.locals.authFamilyId = result.familyId;
      res.locals.authGrantId = result.jti;
      next();
    } catch (error) {
      next(error);
    }
  };
}
/**
 * Sensitive actions (credentials, privileged account changes, factor changes) need a password
 * proof from the last RECENT_AUTH_SECONDS, plus a code when a second factor is enabled. The
 * proof is recorded server-side on the session; this answers 403 REAUTH_REQUIRED so the client
 * can ask for the password and repeat the request, which has not run yet.
 */
export function requireRecentAuth(
  service: AuthService,
  options: { mfa?: boolean } = { mfa: true },
): RequestHandler {
  return async (_req, res, next) => {
    try {
      await service.assertRecentAuth(
        res.locals.user.id,
        res.locals.authFamilyId,
        options,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const role = res.locals.user?.role;
    const allowed =
      role &&
      (roles.includes(role) ||
        (role === "ADMIN" && roles.includes("DISPATCHER")));
    next(
      allowed
        ? undefined
        : new HttpError(
            403,
            "FORBIDDEN",
            "You do not have permission for this action.",
          ),
    );
  };
}
export const requireCompleteProfile: RequestHandler = (_req, res, next) => {
  next(
    res.locals.user?.profileComplete
      ? undefined
      : new HttpError(
          403,
          "PROFILE_INCOMPLETE",
          "Complete your profile before using this feature.",
        ),
  );
};
export { AuthService } from "./service.js";
export { createAuthRouter } from "./routes.js";

export { cleanupAuth } from "./cleanup.js";
export { createAuditRouter } from "./audit-routes.js";
export { MfaService } from "./mfa.js";
