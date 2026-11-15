import createClient from "openapi-fetch";
import type { paths } from "../../../../../packages/contracts/src/api.generated.js";
import {
  sessionSchema,
  publicUserSchema,
  type Problem,
  type Registration,
  type Session,
  completeProfileSchema,
  quoteSchema,
  parcelSchema,
  parcelPageSchema,
  receiptSchema,
  publicTrackingSchema,
  zoneSchema,
  zoneListSchema,
  priceListSchema,
  type QuoteRequest,
  type BookingRequest,
  type ZoneInput,
  type PriceInput,
  adminUsersPageSchema,
  adminUserSchema,
  userStatusChangeSchema,
  type Role,
  type UserStatusChange,
  invitationResultSchema,
  acceptInvitationResultSchema,
  createStaffSchema,
  invitationActionSchema,
  acceptInvitationSchema,
  type CreateStaff,
  type DailyReportSummary,
  merchantRegistrationSchema,
  merchantReviewSchema,
  merchantPageSchema,
  merchantSchema,
  merchantRegistrationResultSchema,
  type MerchantRegistration,
  createMerchantApiClientSchema,
  merchantApiClientPageSchema,
  merchantApiClientSecretSchema,
  merchantOrderPageSchema,
  type MerchantOrderStatus,
  type CreateMerchantApiClient,
  emptySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sessionListSchema,
  loginResultSchema,
  mfaChallengeVerifySchema,
  mfaChallengeRecoverSchema,
  mfaConfirmSchema,
  mfaEnrolResultSchema,
  mfaRecoveryCodesSchema,
  mfaStatusSchema,
  reauthenticateSchema,
  reauthenticateResultSchema,
  type LoginResult,
  merchantWebhookSettingsSchema,
  saveMerchantWebhookSchema,
  saveMerchantWebhookResponseSchema,
  merchantWebhookSecretSchema,
} from "@swiftdrop/contracts";
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: "same-origin",
  cache: "no-store",
});
export class ApiError extends Error {
  constructor(
    public problem: Problem,
    public retryAfter?: string,
  ) {
    super(problem.detail);
  }
}
export async function checked<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): Promise<T> {
  if (!result.response.ok) {
    const error = result.error as Partial<Problem> | undefined;
    throw new ApiError(
      {
        type: error?.type ?? "about:blank",
        title: error?.title ?? "Request failed",
        status: result.response.status,
        detail: error?.detail ?? "Request failed. Please try again.",
        code: error?.code ?? "REQUEST_FAILED",
        correlationId: error?.correlationId ?? "",
        errors: error?.errors,
      },
      result.response.headers.get("Retry-After") ?? undefined,
    );
  }
  return result.data as T;
}
let current: Session | null = null;
let refreshing: Promise<Session> | null = null;
let logoutPending = false;
export const sessionEvents =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("swiftdrop-session");
export function clearSession() {
  current = null;
}
export function blockBootstrap() {
  logoutPending = true;
  clearSession();
}
export function allowBootstrap() {
  logoutPending = false;
}
export const isLogoutPending = () => logoutPending;
async function authLock<T>(operation: () => Promise<T>): Promise<T> {
  if (navigator.locks)
    return navigator.locks.request("swiftdrop-auth", operation);
  // shortcut: older browsers have no cross-tab lock; a rotation race requires signing in again.
  return operation();
}
export async function csrf() {
  return checked(await api.GET("/api/v1/auth/csrf"));
}
export async function register(input: Registration) {
  return authLock(async () => {
    const context = await csrf();
    return checked(
      await api.POST("/api/v1/auth/register", {
        body: input,
        headers: { "X-CSRF-Token": context.csrfToken },
      }),
    );
  });
}
export async function resendVerification(email: string) {
  return authLock(async () => {
    const context = await csrf();
    return checked(
      await api.POST("/api/v1/auth/resend-verification", {
        body: { email },
        headers: { "X-CSRF-Token": context.csrfToken },
      }),
    );
  });
}
export const bearer = async () => current ?? refreshSession();
/**
 * The UI registers one handler that asks the user for their password (and code) and resolves
 * true once the server accepted it, or false if they cancel. Without a handler, a
 * REAUTH_REQUIRED answer simply reaches the caller as an error.
 */
type ReauthHandler = () => Promise<boolean>;
let reauthHandler: ReauthHandler | null = null;
export function setReauthHandler(handler: ReauthHandler | null) {
  reauthHandler = handler;
}
export const sessionExpiredEvents = new EventTarget();
function expireSession() {
  blockBootstrap();
  sessionExpiredEvents.dispatchEvent(new Event("expired"));
  sessionEvents?.postMessage("signed-out");
}
async function authenticated<T>(
  operation: (session: Session) => Promise<T>,
  retryRead = false,
): Promise<T> {
  const session = await bearer();
  try {
    return await operation(session);
  } catch (error) {
    // A sensitive action needs a fresh password proof. The server refused it before doing
    // anything, so after the user confirms, repeating it once is safe.
    if (
      error instanceof ApiError &&
      error.problem.status === 403 &&
      error.problem.code === "REAUTH_REQUIRED" &&
      reauthHandler
    ) {
      if (!(await reauthHandler())) throw error;
      return operation(await bearer());
    }
    if (!(error instanceof ApiError) || error.problem.status !== 401)
      throw error;
    const renewed = await refreshSession();
    // Mutations require a deliberate retry; never repeat a possibly committed write.
    if (!retryRead) throw error;
    try {
      return await operation(renewed);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.problem.status === 401)
        expireSession();
      throw retryError;
    }
  }
}
export async function createQuote(input: QuoteRequest) {
  return authenticated(async (session) => {
    const context = await csrf();
    return quoteSchema.parse(
      await checked(
        await api.POST("/api/v1/quotes", {
          body: input,
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function createParcel(input: BookingRequest, key: string) {
  return authenticated(async (session) => {
    const context = await csrf();
    return parcelSchema.parse(
      await checked(
        await api.POST("/api/v1/parcels", {
          params: { header: { "Idempotency-Key": key } },
          body: input,
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function listParcels(cursor?: string) {
  return authenticated(async (session) => {
    return parcelPageSchema.parse(
      await checked(
        await api.GET("/api/v1/parcels", {
          params: { query: cursor ? { cursor } : {} },
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
      ),
    );
  }, true);
}
export async function getParcel(id: string) {
  return authenticated(async (session) => {
    return parcelSchema.parse(
      await checked(
        await api.GET("/api/v1/parcels/{id}", {
          params: { path: { id } },
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
      ),
    );
  }, true);
}
export async function getParcelReceipt(id: string) {
  return authenticated(async (session) => {
    return receiptSchema.parse(
      await checked(
        await api.GET("/api/v1/parcels/{id}/receipt", {
          params: { path: { id } },
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
      ),
    );
  }, true);
}
export async function getTracking(trackingNumber: string) {
  return publicTrackingSchema.parse(
    await checked(
      await api.GET("/api/v1/track/{trackingNumber}", {
        params: { path: { trackingNumber } },
      }),
    ),
  );
}
export async function listZones() {
  return authenticated(async (session) => {
    return zoneListSchema.parse(
      await checked(
        await api.GET("/api/v1/admin/zones", {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
      ),
    );
  }, true);
}
export async function addZone(input: ZoneInput) {
  return authenticated(async (session) => {
    const context = await csrf();
    return zoneSchema.parse(
      await checked(
        await api.POST("/api/v1/admin/zones", {
          body: input,
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function updateZone(id: number, input: ZoneInput) {
  return authenticated(async (session) => {
    const context = await csrf();
    return zoneSchema.parse(
      await checked(
        await api.PATCH("/api/v1/admin/zones/{id}", {
          params: { path: { id: String(id) } },
          body: input,
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function deleteZone(id: number) {
  return authenticated(async (session) => {
    const context = await csrf();
    await checked(
      await api.DELETE("/api/v1/admin/zones/{id}", {
        params: { path: { id: String(id) } },
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    );
  });
}
export async function listPrices() {
  return authenticated(async (session) => {
    return priceListSchema.parse(
      await checked(
        await api.GET("/api/v1/admin/pricing", {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
      ),
    );
  }, true);
}
export async function addPrice(input: PriceInput) {
  return authenticated(async (session) => {
    const context = await csrf();
    return checked(
      await api.POST("/api/v1/admin/pricing", {
        body: input,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    );
  });
}
export async function getDailyReport(
  from?: string,
  to?: string,
): Promise<DailyReportSummary> {
  return authenticated(async (session) => {
    return checked(
      await api.GET("/api/v1/admin/reports/daily", {
        params: {
          query: {
            from,
            to,
            format: "json",
          },
        },
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }),
    );
  }, true);
}
export async function downloadDailyReportCsv(from?: string, to?: string) {
  return authenticated(async (session) => {
    const query = new URLSearchParams({ format: "csv" });
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const url = `/api/v1/admin/reports/daily?${query.toString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to download CSV report.");
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `daily-report-${from || "start"}-to-${to || "today"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  });
}
export async function listUsers(filters: {
  role?: Role;
  status?: "INVITED" | "ACTIVE" | "SUSPENDED";
  cursor?: string;
}) {
  return authenticated(async (session) => {
    return adminUsersPageSchema.parse(
      await checked(
        await api.GET("/api/v1/admin/users", {
          params: { query: filters },
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }),
      ),
    );
  }, true);
}
export async function createStaff(input: CreateStaff) {
  return authenticated(async (session) => {
    const context = await csrf();
    return invitationResultSchema.parse(
      await checked(
        await api.POST("/api/v1/admin/users", {
          body: createStaffSchema.parse(input),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function updateInvitation(
  id: number,
  action: "resend" | "revoke",
) {
  return authenticated(async (session) => {
    const context = await csrf();
    return invitationResultSchema.parse(
      await checked(
        await api.POST("/api/v1/admin/users/{id}/invitation", {
          params: { path: { id: String(id) } },
          body: invitationActionSchema.parse({ action }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function updateUserStatus(
  id: number,
  status: UserStatusChange["status"],
) {
  return authenticated(async (session) => {
    const context = await csrf();
    return adminUserSchema.parse(
      await checked(
        await api.PATCH("/api/v1/admin/users/{id}/status", {
          params: { path: { id: String(id) } },
          body: userStatusChangeSchema.parse({ status }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function registerMerchant(input: MerchantRegistration) {
  return authLock(async () => {
    const context = await csrf();
    return merchantRegistrationResultSchema.parse(
      await checked(
        await api.POST("/api/v1/merchant/register", {
          body: merchantRegistrationSchema.parse(input),
          headers: { "X-CSRF-Token": context.csrfToken },
        }),
      ),
    );
  });
}
export async function listMerchants() {
  return authenticated(
    async (session) =>
      merchantPageSchema.parse(
        await checked(
          await api.GET("/api/v1/admin/merchants", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
export async function reviewMerchant(
  id: string,
  status: "APPROVED" | "REJECTED",
) {
  return authenticated(async (session) => {
    const context = await csrf();
    return merchantSchema.parse(
      await checked(
        await api.PATCH("/api/v1/admin/merchants/{id}/review", {
          params: { path: { id } },
          body: merchantReviewSchema.parse({ status }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function listMerchantApiClients() {
  return authenticated(
    async (session) =>
      merchantApiClientPageSchema.parse(
        await checked(
          await api.GET("/api/v1/merchant/clients", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
export async function listMerchantOrders(status?: MerchantOrderStatus) {
  return authenticated(
    async (session) =>
      merchantOrderPageSchema.parse(
        await checked(
          await api.GET("/api/v1/merchant/orders", {
            params: { query: status ? { status } : {} },
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
export async function createMerchantApiClient(input: CreateMerchantApiClient) {
  return authenticated(async (session) => {
    const context = await csrf();
    return merchantApiClientSecretSchema.parse(
      await checked(
        await api.POST("/api/v1/merchant/clients", {
          body: createMerchantApiClientSchema.parse(input),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function rotateMerchantApiClient(id: string) {
  return authenticated(async (session) => {
    const context = await csrf();
    return merchantApiClientSecretSchema.parse(
      await checked(
        await api.POST("/api/v1/merchant/clients/{id}/rotate", {
          params: { path: { id } },
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function revokeMerchantApiClient(id: string) {
  return authenticated(async (session) => {
    const context = await csrf();
    await checked(
      await api.POST("/api/v1/merchant/clients/{id}/revoke", {
        params: { path: { id } },
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    );
  });
}
export async function getMerchantWebhookSettings() {
  return authenticated(
    async (session) =>
      merchantWebhookSettingsSchema.parse(
        await checked(
          await api.GET("/api/v1/merchant/webhook", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
export async function saveMerchantWebhookSettings(url: string) {
  return authenticated(async (session) => {
    const context = await csrf();
    return saveMerchantWebhookResponseSchema.parse(
      await checked(
        await api.PUT("/api/v1/merchant/webhook", {
          body: saveMerchantWebhookSchema.parse({ url }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function rotateMerchantWebhookSecret() {
  return authenticated(async (session) => {
    const context = await csrf();
    return merchantWebhookSecretSchema.parse(
      await checked(
        await api.POST("/api/v1/merchant/webhook/rotate-secret", {
          body: emptySchema.parse({}),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function acceptInvitation(token: string, password: string) {
  const context = await csrf();
  return acceptInvitationResultSchema.parse(
    await checked(
      await api.POST("/api/v1/auth/accept-invite", {
        body: acceptInvitationSchema.parse({ token, password }),
        headers: { "X-CSRF-Token": context.csrfToken },
      }),
    ),
  );
}
export async function verifyEmail(token: string) {
  return authLock(async () => {
    const context = await csrf();
    return checked(
      await api.POST("/api/v1/auth/verify-email", {
        body: { token },
        headers: { "X-CSRF-Token": context.csrfToken },
      }),
    );
  });
}
export async function requestPasswordReset(email: string) {
  return authLock(async () => {
    const context = await csrf();
    return checked(
      await api.POST("/api/v1/auth/forgot-password", {
        body: forgotPasswordSchema.parse({ email }),
        headers: { "X-CSRF-Token": context.csrfToken },
      }),
    );
  });
}
export async function resetPassword(token: string, password: string) {
  return authLock(async () => {
    const context = await csrf();
    return checked(
      await api.POST("/api/v1/auth/reset-password", {
        body: resetPasswordSchema.parse({ token, password }),
        headers: { "X-CSRF-Token": context.csrfToken },
      }),
    );
  });
}
/**
 * The server revokes every session, this one included, and answers with one new session. Other
 * tabs find out on their next request, so only this tab keeps the new token.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const result = await authenticated(async (session) => {
    const context = await csrf();
    return sessionSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/change-password", {
          body: changePasswordSchema.parse({ currentPassword, newPassword }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
  current = result;
  return result;
}
export async function listSessions(cursor?: string) {
  return authenticated(
    async (session) =>
      sessionListSchema.parse(
        await checked(
          await api.GET("/api/v1/auth/sessions", {
            params: { query: { ...(cursor ? { cursor } : {}), limit: 20 } },
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
/** Revoking this browser's own session also signs it out; the caller then clears its state. */
export async function revokeSession(id: string, isCurrent: boolean) {
  await authenticated(async (session) => {
    const context = await csrf();
    await checked(
      await api.DELETE("/api/v1/auth/sessions/{id}", {
        params: { path: { id } },
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    );
  });
  if (isCurrent) {
    clearSession();
    sessionEvents?.postMessage("signed-out");
  }
}
export async function getMfaStatus() {
  return authenticated(
    async (session) =>
      mfaStatusSchema.parse(
        await checked(
          await api.GET("/api/v1/auth/mfa", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
export async function enrolMfa() {
  return authenticated(async (session) => {
    const context = await csrf();
    return mfaEnrolResultSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/mfa/enrol", {
          body: {},
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function confirmMfa(code: string) {
  return authenticated(async (session) => {
    const context = await csrf();
    return mfaRecoveryCodesSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/mfa/confirm", {
          body: mfaConfirmSchema.parse({ code }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function regenerateRecoveryCodes() {
  return authenticated(async (session) => {
    const context = await csrf();
    return mfaRecoveryCodesSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/mfa/recovery-codes", {
          body: {},
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function disableMfa() {
  await authenticated(async (session) => {
    const context = await csrf();
    await checked(
      await api.DELETE("/api/v1/auth/mfa", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    );
  });
}
/** Confirms the password (and, with a second factor, a code) for sensitive actions. */
export async function reauthenticate(password: string, code?: string) {
  return authenticated(async (session) => {
    const context = await csrf();
    return reauthenticateResultSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/reauthenticate", {
          body: reauthenticateSchema.parse({
            password,
            ...(code ? { code } : {}),
          }),
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "X-CSRF-Token": context.csrfToken,
          },
        }),
      ),
    );
  });
}
export async function googleProviders() {
  return checked(await api.GET("/api/v1/auth/providers"));
}
export async function completeProfile(input: {
  fullName: string;
  phone: string;
}) {
  return authenticated(async (session) => {
    const context = await csrf();
    const user = await checked(
      await api.POST("/api/v1/auth/complete-profile", {
        body: completeProfileSchema.parse(input),
        headers: {
          "X-CSRF-Token": context.csrfToken,
          Authorization: `Bearer ${session.accessToken}`,
        },
      }),
    );
    return publicUserSchema.parse(user);
  });
}
export async function beginGoogleLink(password: string) {
  return authenticated((session) =>
    authLock(async () => {
      const context = await csrf();
      return checked(
        await api.POST("/api/v1/auth/google/link", {
          body: { password },
          headers: {
            "X-CSRF-Token": context.csrfToken,
            Authorization: `Bearer ${session.accessToken}`,
          },
        }),
      );
    }),
  );
}
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const result = await authLock(async () => {
    const context = await csrf();
    return loginResultSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/login", {
          body: { email, password },
          headers: { "X-CSRF-Token": context.csrfToken },
        }),
      ),
    );
  });
  // An account with a second factor gets only a challenge: no session exists yet.
  if (result.state === "mfa_required") return result;
  logoutPending = false;
  current = result;
  sessionEvents?.postMessage("signed-in");
  return result;
}
function adopt(result: Session) {
  logoutPending = false;
  current = result;
  sessionEvents?.postMessage("signed-in");
  return result;
}
/** Second step of sign-in with an authenticator code. */
export async function completeMfa(challengeToken: string, code: string) {
  return adopt(
    await authLock(async () => {
      const context = await csrf();
      return sessionSchema.parse(
        await checked(
          await api.POST("/api/v1/auth/mfa/challenge/verify", {
            body: mfaChallengeVerifySchema.parse({ challengeToken, code }),
            headers: { "X-CSRF-Token": context.csrfToken },
          }),
        ),
      );
    }),
  );
}
/** Second step of sign-in with a one-use recovery code. */
export async function recoverMfa(challengeToken: string, recoveryCode: string) {
  return adopt(
    await authLock(async () => {
      const context = await csrf();
      return sessionSchema.parse(
        await checked(
          await api.POST("/api/v1/auth/mfa/challenge/recover", {
            body: mfaChallengeRecoverSchema.parse({
              challengeToken,
              recoveryCode,
            }),
            headers: { "X-CSRF-Token": context.csrfToken },
          }),
        ),
      );
    }),
  );
}
export function refreshSession(): Promise<Session> {
  if (refreshing) return refreshing;
  if (logoutPending)
    return Promise.reject(
      new Error("Sign-out is pending. Retry sign-out or sign in explicitly."),
    );
  refreshing = authLock(async () => {
    const context = await csrf();
    const result = sessionSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/refresh", {
          body: {},
          headers: { "X-CSRF-Token": context.csrfToken },
        }),
      ),
    );
    if (logoutPending) throw new Error("Sign-out is pending.");
    current = result;
    return result;
  })
    .catch((error) => {
      current = null;
      if (error instanceof ApiError && error.problem.status === 401)
        expireSession();
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
export async function checkSession() {
  return authenticated(
    async (session) =>
      publicUserSchema.parse(
        await checked(
          await api.GET("/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }),
        ),
      ),
    true,
  );
}
export async function logout(all = false) {
  const previous = current;
  blockBootstrap();
  try {
    await authLock(async () => {
      const context = await csrf();
      if (all && previous)
        await checked(
          await api.POST("/api/v1/auth/logout-all", {
            body: {},
            headers: {
              "X-CSRF-Token": context.csrfToken,
              Authorization: `Bearer ${previous.accessToken}`,
            },
          }),
        );
      else
        await checked(
          await api.POST("/api/v1/auth/logout", {
            body: {},
            headers: { "X-CSRF-Token": context.csrfToken },
          }),
        );
    });
  } finally {
    clearSession();
    sessionEvents?.postMessage("signed-out");
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? `${error.message}${error.retryAfter ? ` Retry after ${error.retryAfter} seconds.` : ""}`
    : "Cannot reach SwiftDrop. Check your connection and try again.";

export async function sendAssistantMessage(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
) {
  const headers: Record<string, string> = {};
  if (current?.accessToken) {
    headers.Authorization = `Bearer ${current.accessToken}`;
  }
  return checked(
    await api.POST("/api/v1/assistant/chat", {
      body: { message, history },
      headers,
    }),
  );
}
