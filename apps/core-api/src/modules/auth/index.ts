import type { RequestHandler } from "express";
import type { Role } from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import type { AuthService } from "./service.js";
export function authenticate(service: AuthService): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await service.authenticate(req.get("authorization"));
      res.locals.user = result.user;
      res.locals.authFamilyId = result.familyId;
      res.locals.authGrantId = result.jti;
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
