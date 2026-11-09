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
} from "@swiftdrop/contracts";
const api = createClient<paths>({
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
async function csrf() {
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
const bearer = async () => current ?? refreshSession();
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
export async function getDailyReport(from?: string, to?: string): Promise<DailyReportSummary> {
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
export async function login(email: string, password: string) {
  const result = await authLock(async () => {
    const context = await csrf();
    return sessionSchema.parse(
      await checked(
        await api.POST("/api/v1/auth/login", {
          body: { email, password },
          headers: { "X-CSRF-Token": context.csrfToken },
        }),
      ),
    );
  });
  logoutPending = false;
  current = result;
  sessionEvents?.postMessage("signed-in");
  return result;
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
