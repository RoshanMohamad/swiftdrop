import { Router, type CookieOptions, type RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { doubleCsrf } from "csrf-csrf";
import {
  emptySchema,
  loginSchema,
  registrationSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sessionListQuerySchema,
  mfaChallengeVerifySchema,
  mfaChallengeRecoverSchema,
  mfaConfirmSchema,
  reauthenticateSchema,
  MFA_CHALLENGE_SECONDS,
  completeProfileSchema,
  googleLinkSchema,
  acceptInvitationSchema,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { HttpError } from "../../shared/problem.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import { AuthService } from "./service.js";
import { authenticate, requireRecentAuth, requireRole } from "./index.js";
import { publicUser } from "./service.js";
import type { UsersService } from "../users/service.js";
export const cookieNames = (secure: boolean) => ({
  refresh: secure ? "__Host-swiftdrop-refresh" : "swiftdrop-refresh",
  csrf: secure ? "__Host-swiftdrop-csrf" : "swiftdrop-csrf",
  context: secure ? "__Host-swiftdrop-context" : "swiftdrop-context",
  oauth: secure ? "__Host-swiftdrop-oauth" : "swiftdrop-oauth",
});
export function createAuthRouter(
  service: AuthService,
  limiter: RateLimiter,
  config: Config,
  users: UsersService,
) {
  const router = Router();
  const names = cookieNames(config.secure);
  const options: CookieOptions = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "strict",
    path: "/",
  };
  const csrf = doubleCsrf({
    getSecret: () => config.csrfSecret,
    getSessionIdentifier: (req) =>
      req.cookies[names.refresh] ?? req.cookies[names.context] ?? "",
    cookieName: names.csrf,
    cookieOptions: options,
  });
  const oauthOptions: CookieOptions = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  };
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const originCheck: RequestHandler = (req, _res, next) => {
    let origin = req.get("origin");
    if (!origin && req.get("referer")) {
      try {
        origin = new URL(req.get("referer")!).origin;
      } catch {
        /* invalid origin is rejected below */
      }
    }
    if (origin !== config.APP_ORIGIN)
      return next(
        new HttpError(403, "ORIGIN", "Request origin is not allowed."),
      );
    // A DELETE carries no body, so only a request that sends one must declare JSON.
    if (req.method !== "DELETE" && !req.is("application/json"))
      return next(new HttpError(415, "CONTENT_TYPE", "Send application/json."));
    next();
  };
  router.get("/csrf", limiter.middleware("csrf", 240, 60), (req, res) => {
    if (!req.cookies[names.context]) {
      const context = randomBytes(32).toString("base64url");
      req.cookies[names.context] = context;
      res.cookie(names.context, context, {
        ...options,
        maxAge: 30 * 86400 * 1000,
      });
    }
    res.json({ csrfToken: csrf.generateCsrfToken(req, res) });
  });
  router.use(
    (req, res, next) =>
      req.method === "POST" || req.method === "DELETE"
        ? originCheck(req, res, next)
        : next(),
    csrf.doubleCsrfProtection,
  );
  router.get("/providers", (_req, res) =>
    res.json({ google: service.googleAvailable() }),
  );
  router.get(
    "/google",
    limiter.middleware("google-start", 20, 60),
    async (_req, res) => {
      const flow = await service.beginGoogle("login");
      res.cookie(names.oauth, flow.browser, oauthOptions).redirect(flow.url);
    },
  );
  router.get(
    "/google/callback",
    limiter.middleware("google-callback", 60, 60),
    async (req, res) => {
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const browser = req.cookies[names.oauth];
      res.clearCookie(names.oauth, oauthOptions);
      if (req.query.error) {
        if (state && browser) await service.cancelGoogle(state, browser);
        return res.redirect(
          `${config.APP_ORIGIN}/auth/google/result?status=cancelled`,
        );
      }
      try {
        const result = await service.completeGoogle(
          new URL(req.originalUrl, config.APP_ORIGIN),
          state,
          browser ?? "",
        );
        if (result.type === "authenticated") {
          res.cookie(names.refresh, result.refreshToken, {
            ...options,
            expires: result.cookieExpires,
          });
          res.clearCookie(names.csrf, options);
          return res.redirect(
            `${config.APP_ORIGIN}/auth/google/result?status=success`,
          );
        }
        const status = result.type === "linked" ? "linked" : "account_exists";
        return res.redirect(
          `${config.APP_ORIGIN}/auth/google/result?status=${status}`,
        );
      } catch (error) {
        const status =
          error instanceof HttpError && error.code === "GOOGLE_ACCOUNT_EXISTS"
            ? "account_exists"
            : "failed";
        return res.redirect(
          `${config.APP_ORIGIN}/auth/google/result?status=${status}`,
        );
      }
    },
  );
  router.post(
    "/accept-invite",
    limiter.middleware("accept-invite", 10, 900),
    async (req, res) => {
      const input = acceptInvitationSchema.parse(req.body);
      await users.accept(input.token, input.password);
      res.json({ message: "Your account is ready. Sign in to continue." });
    },
  );
  router.post(
    "/register",
    limiter.middleware("signup", 5, 3600),
    async (req, res) => {
      await service.register(registrationSchema.parse(req.body));
      res.status(202).json({
        message:
          "Registration received. You can sign in now; if confirmation is available, an email will arrive shortly.",
      });
    },
  );
  router.post(
    "/resend-verification",
    limiter.middleware("resend-verification", 10, 3600),
    async (req, res) => {
      const { email } = resendVerificationSchema.parse(req.body);
      await service.resendVerification(email);
      res.status(202).json({
        message:
          "If the account can be verified, a new email will be sent shortly.",
      });
    },
  );
  router.post(
    "/verify-email",
    limiter.middleware("verify-email", 30, 900),
    async (req, res) => {
      const { token } = verifyEmailSchema.parse(req.body);
      await service.verifyEmail(token);
      res.json({ message: "Your email is verified. You can sign in." });
    },
  );
  router.post(
    "/forgot-password",
    limiter.middleware("forgot-password", 10, 3600),
    async (req, res) => {
      const { email } = forgotPasswordSchema.parse(req.body);
      // Three requests per address per hour. Beyond that the request is still accepted with
      // the same answer, so the limit itself reveals nothing about the address.
      const hit = await limiter.hit(`forgot-password:email:${email}`, 3, 3600);
      if (!hit.blocked) await service.requestPasswordReset(email);
      res.status(202).json({
        message:
          "If an account can be reset, an email with a reset link will arrive shortly.",
      });
    },
  );
  router.post(
    "/reset-password",
    limiter.middleware("reset-password", 10, 900),
    async (req, res) => {
      const input = resetPasswordSchema.parse(req.body);
      await service.resetPassword(input.token, input.password);
      res.json({
        message: "Your password was changed. Sign in with the new password.",
      });
    },
  );
  router.post(
    "/change-password",
    limiter.middleware("change-password", 30, 900),
    authenticate(service),
    async (req, res) => {
      const input = changePasswordSchema.parse(req.body);
      const attempts = await limiter.hit(
        `change-password:user:${res.locals.user.id}`,
        5,
        900,
      );
      if (attempts.blocked) {
        res.setHeader("Retry-After", attempts.retryAfter);
        throw new HttpError(
          429,
          "RATE_LIMITED",
          "Too many password change attempts. Please try again later.",
        );
      }
      const result = await service.changePassword(
        res.locals.user.id,
        input.currentPassword,
        input.newPassword,
      );
      res.cookie(names.refresh, result.refreshToken, {
        ...options,
        expires: result.cookieExpires,
      });
      res.clearCookie(names.csrf, options);
      res.json(result.response);
    },
  );
  router.get("/sessions", authenticate(service), async (req, res) => {
    const page = sessionListQuerySchema.parse(req.query);
    res.json(
      await service.listSessions(
        res.locals.user.id,
        res.locals.authFamilyId,
        page,
      ),
    );
  });
  router.delete(
    "/sessions/:id",
    limiter.middleware("session-revoke", 60, 60),
    authenticate(service),
    async (req, res) => {
      const id = String(req.params.id);
      await service.revokeSession(res.locals.user.id, id);
      // Revoking the session this browser is using signs it out.
      if (id === res.locals.authFamilyId)
        res
          .clearCookie(names.refresh, options)
          .clearCookie(names.csrf, options)
          .clearCookie(names.context, options);
      res.status(204).end();
    },
  );
  router.post(
    "/complete-profile",
    authenticate(service),
    requireRole("CUSTOMER"),
    async (req, res) => {
      const input = completeProfileSchema.parse(req.body);
      const user = await service.completeProfile(res.locals.user.id, input);
      res.json(publicUser(user));
    },
  );
  router.post(
    "/google/link",
    limiter.middleware("google-link", 10, 900),
    authenticate(service),
    requireRole("CUSTOMER"),
    async (req, res) => {
      const { password } = googleLinkSchema.parse(req.body);
      const flow = await service.beginGoogleLink(
        res.locals.user.id,
        res.locals.authFamilyId,
        password,
      );
      res.cookie(names.oauth, flow.browser, oauthOptions);
      res.json({ authorizationUrl: flow.url });
    },
  );
  router.post(
    "/login",
    limiter.middleware("login", 30, 900),
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      if ((await limiter.failures(input.email)) >= 5) {
        res.setHeader("Retry-After", "900");
        throw new HttpError(
          429,
          "RATE_LIMITED",
          "Too many sign-in attempts. Please try again in 15 minutes.",
        );
      }
      let result;
      try {
        result = await service.beginLogin(input.email, input.password);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          await limiter.failed(input.email);
          throw new HttpError(
            401,
            "INVALID_CREDENTIALS",
            "Email or password is incorrect.",
          );
        }
        throw error;
      }
      await limiter.succeeded(input.email);
      // A password alone is not a session for an account with a second factor: no cookie, no
      // token, only an opaque challenge to complete with a code.
      if ("challengeToken" in result)
        return res.json({
          state: "mfa_required",
          challengeToken: result.challengeToken,
          expiresIn: MFA_CHALLENGE_SECONDS,
        });
      res.cookie(names.refresh, result.refreshToken, {
        ...options,
        expires: result.cookieExpires,
      });
      res.clearCookie(names.csrf, options);
      res.json(result.response);
    },
  );
  const startSessionCookies = (
    res: Parameters<RequestHandler>[1],
    result: { refreshToken: string; cookieExpires: Date },
  ) => {
    res.cookie(names.refresh, result.refreshToken, {
      ...options,
      expires: result.cookieExpires,
    });
    res.clearCookie(names.csrf, options);
  };
  router.post(
    "/mfa/challenge/verify",
    limiter.middleware("mfa-challenge", 30, 900),
    async (req, res) => {
      const input = mfaChallengeVerifySchema.parse(req.body);
      const result = await service.verifyMfaChallenge(
        input.challengeToken,
        input.code,
      );
      startSessionCookies(res, result);
      res.json(result.response);
    },
  );
  router.post(
    "/mfa/challenge/recover",
    limiter.middleware("mfa-challenge", 30, 900),
    async (req, res) => {
      const input = mfaChallengeRecoverSchema.parse(req.body);
      const result = await service.recoverMfaChallenge(
        input.challengeToken,
        input.recoveryCode,
      );
      startSessionCookies(res, result);
      res.json(result.response);
    },
  );
  const mfa = () => {
    if (!service.mfa)
      throw new HttpError(404, "NOT_FOUND", "This route does not exist.");
    return service.mfa;
  };
  router.get("/mfa", authenticate(service), async (_req, res) => {
    res.json(await mfa().status(res.locals.user.id, res.locals.user.role));
  });
  router.post(
    "/mfa/enrol",
    limiter.middleware("mfa-enrol", 20, 900),
    authenticate(service),
    requireRecentAuth(service),
    async (req, res) => {
      emptySchema.parse(req.body);
      res.json(await mfa().enrol(res.locals.user.id, res.locals.user.email));
    },
  );
  router.post(
    "/mfa/confirm",
    limiter.middleware("mfa-confirm", 20, 900),
    authenticate(service),
    async (req, res) => {
      const { code } = mfaConfirmSchema.parse(req.body);
      const attempts = await limiter.hit(
        `mfa-confirm:user:${res.locals.user.id}`,
        10,
        900,
      );
      if (attempts.blocked) {
        res.setHeader("Retry-After", attempts.retryAfter);
        throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Please try again later.");
      }
      const recoveryCodes = await mfa().confirm(res.locals.user.id, code);
      // The code just proved the factor works, which also counts as this session's proof.
      await service.markMfaVerified(res.locals.authFamilyId);
      res.json({ recoveryCodes });
    },
  );
  router.post(
    "/mfa/recovery-codes",
    limiter.middleware("mfa-recovery-codes", 10, 900),
    authenticate(service),
    requireRecentAuth(service),
    async (req, res) => {
      emptySchema.parse(req.body);
      res.json({
        recoveryCodes: await mfa().regenerateRecoveryCodes(res.locals.user.id),
      });
    },
  );
  router.delete(
    "/mfa",
    limiter.middleware("mfa-disable", 10, 900),
    authenticate(service),
    requireRecentAuth(service),
    async (_req, res) => {
      await mfa().disable(res.locals.user.id, res.locals.user.role);
      res.status(204).end();
    },
  );
  router.post(
    "/reauthenticate",
    limiter.middleware("reauthenticate", 30, 900),
    authenticate(service),
    async (req, res) => {
      const input = reauthenticateSchema.parse(req.body);
      const attempts = await limiter.hit(
        `reauthenticate:user:${res.locals.user.id}`,
        5,
        900,
      );
      if (attempts.blocked) {
        res.setHeader("Retry-After", attempts.retryAfter);
        throw new HttpError(
          429,
          "RATE_LIMITED",
          "Too many confirmation attempts. Please try again later.",
        );
      }
      const at = await service.reauthenticate(
        res.locals.user.id,
        res.locals.authFamilyId,
        input.password,
        input.code,
      );
      res.json({ reauthenticatedAt: at.toISOString() });
    },
  );
  router.post(
    "/refresh",
    limiter.middleware("refresh", 120, 60),
    async (req, res) => {
      emptySchema.parse(req.body);
      const raw: unknown = req.cookies[names.refresh];
      const familyId = await service.refreshFamily(raw);
      if (familyId) {
        const result = await limiter.hit(`refresh-family:${familyId}`, 30, 60);
        if (result.blocked) {
          res.setHeader("Retry-After", result.retryAfter);
          throw new HttpError(
            429,
            "RATE_LIMITED",
            "Too many session requests. Please wait and retry.",
          );
        }
      }
      try {
        const result = await service.refresh(raw);
        res.cookie(names.refresh, result.refreshToken, {
          ...options,
          expires: result.cookieExpires,
        });
        res.clearCookie(names.csrf, options);
        res.json(result.response);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          res.clearCookie(names.refresh, options);
        throw error;
      }
    },
  );
  router.post(
    "/logout",
    limiter.middleware("logout", 60, 60),
    async (req, res) => {
      emptySchema.parse(req.body);
      await service.logout(req.cookies[names.refresh]);
      res
        .clearCookie(names.refresh, options)
        .clearCookie(names.csrf, options)
        .clearCookie(names.context, options)
        .status(204)
        .end();
    },
  );
  router.post(
    "/logout-all",
    limiter.middleware("logout-all", 20, 60),
    authenticate(service),
    async (req, res) => {
      emptySchema.parse(req.body);
      await service.revokeAll(res.locals.user.id);
      res
        .clearCookie(names.refresh, options)
        .clearCookie(names.csrf, options)
        .clearCookie(names.context, options)
        .status(204)
        .end();
    },
  );
  return router;
}
