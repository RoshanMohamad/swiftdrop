/**
 * MSW request handlers for SwiftDrop Web.
 *
 * Provides realistic mock responses for all core API endpoints, enabling
 * standalone frontend development (`pnpm --filter web dev:mock`) and
 * contract-driven integration testing without backend dependencies.
 */

import { http, HttpResponse } from "msw";

export const mockCustomerUser = {
  id: 1,
  email: "customer@swiftdrop.test",
  fullName: "Demo Customer",
  phone: "+94771234567",
  role: "CUSTOMER" as const,
  status: "ACTIVE" as const,
  emailVerified: true,
  profileComplete: true,
};

export const mockAdminUser = {
  id: 2,
  email: "admin@swiftdrop.test",
  fullName: "Demo Admin",
  phone: "+94771234568",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  emailVerified: true,
  profileComplete: true,
};

/**
 * Mock mode only: pick which role `/auth/me`, login and refresh return by
 * setting `localStorage["swiftdrop.mockRole"]` (e.g. "CUSTOMER", "COURIER").
 * Defaults to the admin so existing tests are unaffected.
 */
function mockRole(): string | null {
  try {
    return globalThis.localStorage?.getItem("swiftdrop.mockRole") ?? null;
  } catch {
    return null;
  }
}

/** `GUEST` simulates a signed-out browser so the auth pages can be viewed. */
function isMockGuest() {
  return mockRole() === "GUEST";
}

function signedOut() {
  return HttpResponse.json(
    {
      type: "https://swiftdrop.lk/problems/unauthenticated",
      title: "Unauthenticated",
      status: 401,
      detail: "Sign in to continue.",
    },
    { status: 401, headers: { "Content-Type": "application/problem+json" } },
  );
}

function currentMockUser() {
  const role = mockRole();
  switch (role) {
    case "CUSTOMER":
      return mockCustomerUser;
    case "MERCHANT":
    case "COURIER":
    case "DISPATCHER":
      return {
        ...mockAdminUser,
        id: { MERCHANT: 10, COURIER: 5, DISPATCHER: 4 }[role],
        fullName: {
          MERCHANT: "Sunil Silva",
          COURIER: "Rider Courier",
          DISPATCHER: "Dispatch Staff",
        }[role],
        role,
      } as unknown as typeof mockAdminUser;
    default:
      return mockAdminUser;
  }
}

export const mockZones = [
  { id: 1, district: "Colombo", town: "Colombo Fort", active: true },
  { id: 2, district: "Kandy", town: "Kandy Town", active: true },
  { id: 3, district: "Galle", town: "Galle Fort", active: false },
];

export const mockPrices = [
  {
    id: 1,
    originZoneId: 1,
    destinationZoneId: 2,
    baseCents: 50000,
    perExtraKgCents: 10000,
    effectiveFrom: "2026-12-01T00:00:00.000Z",
  },
];

export const mockParcels = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    trackingNumber: "SD-7KQ2M9XA-Y",
    status: "IN_TRANSIT" as const,
    feeCents: 57000,
    currency: "LKR" as const,
    originTown: "Colombo Fort",
    destinationTown: "Kandy Town",
    recipientName: "Kamal Perera",
    recipientPhone: "+94771234567",
    recipientAddress: "12 Peradeniya Road, Kandy",
    createdAt: "2026-11-01T10:00:00.000Z",
    weightGrams: 2000,
    lengthMm: 250,
    widthMm: 180,
    heightMm: 120,
    history: [
      {
        status: "CREATED" as const,
        town: "Colombo Fort",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        status: "PICKED_UP" as const,
        town: "Colombo Fort",
        createdAt: "2026-11-01T14:30:00.000Z",
      },
      {
        status: "IN_TRANSIT" as const,
        town: "Kadawatha Interchange",
        createdAt: "2026-11-01T17:00:00.000Z",
      },
    ],
  },
];

export const mockMerchants = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    userId: 10,
    email: "merchant@ceylontea.test",
    fullName: "Sunil Silva",
    phone: "+94779876543",
    businessName: "Ceylon Artisan Teas",
    status: "PENDING" as const,
    createdAt: "2026-11-10T08:00:00.000Z",
    reviewedAt: null,
  },
];

export const mockMerchantClient = {
  id: "44444444-4444-4444-8444-444444444444",
  clientId: `sd_cli_${"A".repeat(24)}`,
  name: "Shop integration",
  scopes: ["orders:read", "orders:write"],
  createdAt: "2026-11-10T08:00:00.000Z",
  rotatedAt: null,
  revokedAt: null,
};
export const mockMerchantClients: Array<
  Omit<typeof mockMerchantClient, "rotatedAt" | "revokedAt"> & {
    rotatedAt: string | null;
    revokedAt: string | null;
  }
> = [{ ...mockMerchantClient }];

export const mockMerchantOrders = [
  {
    trackingNumber: "SD-7KQ2M9XA-Y",
    status: "IN_TRANSIT" as const,
    originDistrict: "Colombo",
    destinationDistrict: "Kandy",
    recipientName: "Kamal Perera",
    recipientPhone: "+94771234567",
    feeCents: 57000,
    createdAt: "2026-11-18T09:30:00.000Z",
  },
  {
    trackingNumber: "SD-4HNP6RTD-N",
    status: "CREATED" as const,
    originDistrict: "Colombo",
    destinationDistrict: "Galle",
    recipientName: "Nimali Fernando",
    recipientPhone: "+94772345678",
    feeCents: 50000,
    createdAt: "2026-11-19T11:15:00.000Z",
  },
];

export const mockMerchantDeliveries = Array.from(
  { length: 30 },
  (_, index) => ({
    eventId: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
    eventType: index % 2 === 0 ? "parcel.created" : "parcel.status.changed",
    status: (["SUCCESS", "FAILED", "PENDING", "SKIPPED", "SUCCESS"] as const)[
      index % 5
    ]!,
    createdAt: new Date(Date.UTC(2026, 10, 20 - index, 10, 0)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 10, 20 - index, 10, 5)).toISOString(),
  }),
);

const mockProblem = (
  detail = "The Merchant service is temporarily unavailable.",
) =>
  HttpResponse.json(
    {
      type: "about:blank",
      title: "Service Unavailable",
      status: 503,
      detail,
      correlationId: "mock-correlation-id",
    },
    { status: 503, headers: { "Content-Type": "application/problem+json" } },
  );

export const mockStaffUsers = [
  {
    id: 4,
    fullName: "Dispatch Staff",
    email: "dispatch@swiftdrop.test",
    phone: "+94771234567",
    role: "DISPATCHER" as const,
    status: "ACTIVE" as const,
    createdAt: "2026-10-30T00:00:00.000Z",
    invitationExpiresAt: null,
  },
  {
    id: 5,
    fullName: "Rider Courier",
    email: "courier@swiftdrop.test",
    phone: "+94772345678",
    role: "COURIER" as const,
    status: "INVITED" as const,
    createdAt: "2026-11-01T00:00:00.000Z",
    invitationExpiresAt: "2026-11-08T00:00:00.000Z",
  },
];

export const mockDailyReport = {
  from: "2026-11-01",
  to: "2026-11-02",
  totalBooked: 15,
  totalDelivered: 12,
  totalFailed: 3,
  overallSuccessRatePercent: 80.0,
  days: [
    {
      date: "2026-11-01",
      totalBooked: 8,
      totalDelivered: 7,
      totalFailed: 1,
      totalInTransit: 0,
      successRatePercent: 87.5,
    },
    {
      date: "2026-11-02",
      totalBooked: 7,
      totalDelivered: 5,
      totalFailed: 2,
      totalInTransit: 0,
      successRatePercent: 71.4,
    },
  ],
};

export const handlers = [
  // ── CSRF & Providers ────────────────────────────────────────────────────────
  http.get("/api/v1/auth/csrf", () => {
    return HttpResponse.json({ token: "mock-csrf-token-12345" });
  }),

  http.get("/api/v1/auth/providers", () => {
    return HttpResponse.json({ google: false });
  }),

  // ── Authentication & Session ────────────────────────────────────────────────
  http.get("/api/v1/auth/me", () => {
    if (isMockGuest()) return signedOut();
    return HttpResponse.json(currentMockUser());
  }),

  http.post("/api/v1/auth/login", () => {
    return HttpResponse.json({
      state: "authenticated",
      accessToken: "mock-jwt-access-token",
      tokenType: "Bearer",
      expiresIn: 900,
      user: currentMockUser(),
    });
  }),

  http.post("/api/v1/auth/refresh", () => {
    if (isMockGuest()) return signedOut();
    return HttpResponse.json({
      state: "authenticated",
      accessToken: "mock-jwt-refreshed-token",
      tokenType: "Bearer",
      expiresIn: 900,
      user: currentMockUser(),
    });
  }),

  http.post("/api/v1/auth/logout", () => {
    return HttpResponse.json({});
  }),

  http.post("/api/v1/auth/logout-all", () => {
    return HttpResponse.json({});
  }),

  http.post("/api/v1/auth/register", () => {
    return HttpResponse.json({
      message:
        "Registration successful. Please check your email to verify your account.",
    });
  }),

  http.post("/api/v1/auth/resend-verification", () => {
    return HttpResponse.json({
      message: "Verification email sent.",
    });
  }),

  http.post("/api/v1/auth/verify-email", () => {
    return HttpResponse.json({
      message: "Email successfully verified. You may now sign in.",
    });
  }),

  // Same answer for every address, exactly like the real endpoint.
  http.post("/api/v1/auth/forgot-password", () =>
    HttpResponse.json(
      {
        message:
          "If an account can be reset, an email with a reset link will arrive shortly.",
      },
      { status: 202 },
    ),
  ),

  http.post("/api/v1/auth/reset-password", () =>
    HttpResponse.json({
      message: "Your password was changed. Sign in with the new password.",
    }),
  ),

  http.post("/api/v1/auth/change-password", () =>
    HttpResponse.json({
      state: "authenticated",
      accessToken: "mock-access-token-after-password-change",
      tokenType: "Bearer",
      expiresIn: 900,
      user: mockCustomerUser,
    }),
  ),

  http.get("/api/v1/auth/sessions", () => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 86_400_000).toISOString();
    return HttpResponse.json({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          authenticatedAt: now,
          lastRefreshedAt: now,
          idleExpiresAt: later,
          absoluteExpiresAt: later,
          current: true,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          authenticatedAt: now,
          lastRefreshedAt: now,
          idleExpiresAt: later,
          absoluteExpiresAt: later,
          current: false,
        },
      ],
    });
  }),

  http.delete(
    "/api/v1/auth/sessions/:id",
    () => new HttpResponse(null, { status: 204 }),
  ),

  http.get("/api/v1/auth/mfa", () =>
    HttpResponse.json({
      enabled: false,
      pendingEnrolment: false,
      recoveryCodesRemaining: 0,
      required: false,
    }),
  ),

  http.post("/api/v1/auth/mfa/enrol", () =>
    HttpResponse.json({
      secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      otpauthUri:
        "otpauth://totp/SwiftDrop:mock%40example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=SwiftDrop",
    }),
  ),

  http.post("/api/v1/auth/mfa/confirm", () =>
    HttpResponse.json({
      recoveryCodes: Array.from({ length: 10 }, (_, i) => `MOCK${i}-ABCDE`),
    }),
  ),

  http.post("/api/v1/auth/mfa/recovery-codes", () =>
    HttpResponse.json({
      recoveryCodes: Array.from({ length: 10 }, (_, i) => `NEW${i}K-FGHJK`),
    }),
  ),

  http.delete(
    "/api/v1/auth/mfa",
    () => new HttpResponse(null, { status: 204 }),
  ),

  http.post("/api/v1/auth/reauthenticate", () =>
    HttpResponse.json({ reauthenticatedAt: new Date().toISOString() }),
  ),

  http.post("/api/v1/auth/complete-profile", async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    return HttpResponse.json({
      ...mockCustomerUser,
      fullName: body["fullName"] ?? mockCustomerUser.fullName,
      phone: body["phone"] ?? mockCustomerUser.phone,
      profileComplete: true,
    });
  }),

  http.patch("/api/v1/auth/me", async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    const user = currentMockUser();
    return HttpResponse.json({
      ...user,
      fullName: body["fullName"] ?? user.fullName,
      phone: body["phone"] ?? user.phone,
    });
  }),

  http.post("/api/v1/auth/accept-invite", () => {
    return HttpResponse.json({
      message: "Invitation accepted. You can now log in.",
    });
  }),

  // ── Quotes & Parcels ────────────────────────────────────────────────────────
  http.post("/api/v1/quotes", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: "550e8400-e29b-41d4-a716-446655440000",
      originDistrict: (body["originDistrict"] as string) || "Colombo",
      destinationDistrict: (body["destinationDistrict"] as string) || "Kandy",
      originTown: "Colombo Fort",
      destinationTown: "Kandy Town",
      weightGrams: (body["weightGrams"] as number) || 1500,
      lengthMm: (body["lengthMm"] as number) || 200,
      widthMm: (body["widthMm"] as number) || 150,
      heightMm: (body["heightMm"] as number) || 100,
      feeCents: 57000,
      currency: "LKR",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  }),

  http.get("/api/v1/parcels", () => {
    return HttpResponse.json({
      items: mockParcels,
      nextCursor: null,
    });
  }),

  http.post("/api/v1/parcels", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newParcel = {
      ...mockParcels[0]!,
      id: "44444444-4444-4444-8444-444444444444",
      trackingNumber: "SD-7KQ2M9XA-Y",
      recipientName: (body["recipientName"] as string) || "Recipient",
      recipientPhone: (body["recipientPhone"] as string) || "+94771234567",
      recipientAddress: (body["recipientAddress"] as string) || "Address",
      status: "CREATED" as const,
      createdAt: new Date().toISOString(),
      history: [
        {
          status: "CREATED" as const,
          town: "Colombo Fort",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    return HttpResponse.json(newParcel, { status: 201 });
  }),

  http.get("/api/v1/parcels/:id", ({ params }) => {
    const parcel =
      mockParcels.find((p) => p.id === params["id"]) || mockParcels[0]!;
    return HttpResponse.json(parcel);
  }),

  http.get("/api/v1/parcels/:id/receipt", () => {
    return HttpResponse.json({
      receiptReference: "SDR-SD-7KQ2M9XA-Y",
      downloadUrl: "http://localhost:5173/receipt.pdf",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  }),

  http.get("/api/v1/track/:trackingNumber", ({ params }) => {
    return HttpResponse.json({
      trackingNumber: params["trackingNumber"] as string,
      status: "IN_TRANSIT" as const,
      originTown: "Colombo Fort",
      destinationTown: "Kandy Town",
      history: mockParcels[0]!.history,
    });
  }),

  // ── Admin Zones & Pricing ───────────────────────────────────────────────────
  http.get("/api/v1/admin/zones", () => {
    return HttpResponse.json(mockZones);
  }),

  http.post("/api/v1/admin/zones", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created = {
      id: mockZones.length + 1,
      district: body["district"] as string,
      town: body["town"] as string,
      active: (body["active"] as boolean) ?? true,
    };
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch("/api/v1/admin/zones/:id", async ({ params, request }) => {
    const id = Number(params["id"]);
    const body = (await request.json()) as Record<string, unknown>;
    const existing = mockZones.find((z) => z.id === id);
    const updated = {
      id,
      district: (body["district"] as string) || existing?.district || "Colombo",
      town: (body["town"] as string) || existing?.town || "Fort",
      active:
        typeof body["active"] === "boolean"
          ? body["active"]
          : (existing?.active ?? true),
    };
    return HttpResponse.json(updated);
  }),

  http.delete("/api/v1/admin/zones/:id", () => {
    return HttpResponse.json({});
  }),

  http.get("/api/v1/admin/pricing", () => {
    return HttpResponse.json(mockPrices);
  }),

  http.post("/api/v1/admin/pricing", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created = {
      id: mockPrices.length + 1,
      originZoneId: body["originZoneId"] as number,
      destinationZoneId: body["destinationZoneId"] as number,
      baseCents: body["baseCents"] as number,
      perExtraKgCents: body["perExtraKgCents"] as number,
      effectiveFrom:
        (body["effectiveFrom"] as string) || new Date().toISOString(),
    };
    return HttpResponse.json(created, { status: 201 });
  }),

  // ── Admin Users & Staff ─────────────────────────────────────────────────────
  http.get("/api/v1/admin/users", () => {
    return HttpResponse.json({
      items: mockStaffUsers,
      nextCursor: null,
    });
  }),

  http.post("/api/v1/admin/users", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created = {
      id: 99,
      fullName: body["fullName"] as string,
      email: body["email"] as string,
      phone: body["phone"] as string,
      role: body["role"] as "COURIER" | "DISPATCHER",
      status: "INVITED" as const,
      createdAt: new Date().toISOString(),
      invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post("/api/v1/admin/users/:id/invitation", ({ params }) => {
    const user =
      mockStaffUsers.find((u) => u.id === Number(params["id"])) ||
      mockStaffUsers[0]!;
    return HttpResponse.json({
      user,
      delivery: "sent" as const,
    });
  }),

  http.patch("/api/v1/admin/users/:id/status", async ({ params, request }) => {
    const body = (await request.json()) as { status: "ACTIVE" | "SUSPENDED" };
    const user =
      mockStaffUsers.find((u) => u.id === Number(params["id"])) ||
      mockStaffUsers[0]!;
    return HttpResponse.json({
      ...user,
      status: body.status,
    });
  }),

  // ── Merchants ───────────────────────────────────────────────────────────────
  http.post("/api/v1/merchant/register", ({ request }) => {
    if (new URL(request.url).searchParams.get("mock") === "error")
      return mockProblem();
    return HttpResponse.json(
      { message: "Application submitted for review." },
      { status: 201 },
    );
  }),

  http.get("/api/v1/merchant/clients", ({ request }) => {
    const query = new URL(request.url).searchParams;
    if (query.get("mock") === "error") return mockProblem();
    return HttpResponse.json({
      items: query.get("mock") === "empty" ? [] : mockMerchantClients,
    });
  }),

  http.post("/api/v1/merchant/clients", async ({ request }) => {
    if (new URL(request.url).searchParams.get("mock") === "error")
      return mockProblem();
    const body = (await request.json()) as { name?: string; scopes?: string[] };
    const result = {
      client: {
        ...mockMerchantClient,
        id: crypto.randomUUID(),
        clientId: `sd_cli_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
        name: body.name ?? "New integration",
        scopes: body.scopes ?? ["orders:read"],
        createdAt: new Date().toISOString(),
      },
      clientSecret: `sd_sec_${"S".repeat(43)}`,
    };
    mockMerchantClients.unshift(result.client);
    return HttpResponse.json(result, { status: 201 });
  }),

  http.post("/api/v1/merchant/clients/:id/rotate", ({ params, request }) => {
    if (new URL(request.url).searchParams.get("mock") === "error")
      return mockProblem();
    const client = mockMerchantClients.find((item) => item.id === params["id"]);
    if (!client)
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: "API client was not found.",
          correlationId: "mock-correlation-id",
        },
        {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        },
      );
    client.rotatedAt = new Date().toISOString();
    return HttpResponse.json({
      client,
      clientSecret: `sd_sec_${"R".repeat(43)}`,
    });
  }),

  http.post("/api/v1/merchant/clients/:id/revoke", ({ params, request }) => {
    if (new URL(request.url).searchParams.get("mock") === "error")
      return mockProblem();
    const client = mockMerchantClients.find((item) => item.id === params["id"]);
    if (!client)
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: "API client was not found.",
          correlationId: "mock-correlation-id",
        },
        {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        },
      );
    client.revokedAt = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/v1/merchant/orders", ({ request }) => {
    const query = new URL(request.url).searchParams;
    if (query.get("mock") === "error") return mockProblem();
    const status = query.get("status");
    const items =
      query.get("mock") === "empty"
        ? []
        : mockMerchantOrders.filter(
            (order) => !status || order.status === status,
          );
    return HttpResponse.json({ items });
  }),

  http.get("/api/v1/merchant/webhook", ({ request }) =>
    new URL(request.url).searchParams.get("mock") === "error"
      ? mockProblem()
      : HttpResponse.json({
          configured: true,
          url: "https://hooks.ceylontea.example/swiftdrop",
          updatedAt: "2026-11-18T09:00:00.000Z",
        }),
  ),

  http.put("/api/v1/merchant/webhook", async ({ request }) => {
    if (new URL(request.url).searchParams.get("mock") === "error")
      return mockProblem();
    const body = (await request.json()) as { url?: string };
    return HttpResponse.json({
      settings: {
        configured: true,
        url: body.url ?? "https://hooks.ceylontea.example/swiftdrop",
        updatedAt: new Date().toISOString(),
      },
      signingSecret: `sd_whsec_${"W".repeat(43)}`,
    });
  }),

  http.post("/api/v1/merchant/webhook/rotate-secret", ({ request }) =>
    new URL(request.url).searchParams.get("mock") === "error"
      ? mockProblem()
      : HttpResponse.json({ signingSecret: `sd_whsec_${"N".repeat(43)}` }),
  ),

  http.get("/api/v1/merchant/webhook-deliveries", ({ request }) => {
    const query = new URL(request.url).searchParams;
    if (query.get("mock") === "error") return mockProblem();
    let items = mockMerchantDeliveries.filter(
      (delivery) =>
        !query.has("status") || delivery.status === query.get("status"),
    );
    if (query.get("mock") === "empty") items = [];
    const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 25)));
    const isNextPage = query.has("cursor");
    const page = isNextPage ? items.slice(limit) : items.slice(0, limit);
    const hasNextPage = !isNextPage && items.length > limit;
    return HttpResponse.json({
      items: page,
      nextCursor: hasNextPage ? "mock-deliveries-next-page" : null,
    });
  }),

  http.get("/api/v1/admin/merchants", () => {
    return HttpResponse.json({
      items: mockMerchants,
    });
  }),

  http.patch(
    "/api/v1/admin/merchants/:id/review",
    async ({ params, request }) => {
      const body = (await request.json()) as {
        status: "APPROVED" | "REJECTED";
      };
      const merchant =
        mockMerchants.find((m) => m.id === params["id"]) || mockMerchants[0]!;
      return HttpResponse.json({
        ...merchant,
        status: body.status,
        reviewedAt: new Date().toISOString(),
      });
    },
  ),

  // ── Reports ─────────────────────────────────────────────────────────────────
  http.get("/api/v1/admin/reports/daily", () => {
    return HttpResponse.json(mockDailyReport);
  }),

  // ── Assistant ───────────────────────────────────────────────────────────────
  http.post("/api/v1/assistant/chat", () => {
    return HttpResponse.json({
      reply:
        "Hello! I am your SwiftDrop Assistant. I can help answer questions about deliveries, rates, or schedules.",
      toolsUsed: [],
    });
  }),

  // ── Dispatch and courier (M06 / M07) ────────────────────────────────────────
  http.get("/api/v1/dispatch/parcels", ({ request }) => {
    const state =
      new URL(request.url).searchParams.get("state") ?? "unassigned";
    return HttpResponse.json({
      items: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          trackingNumber: "SD-4HNP6RTD-N",
          status: "CREATED",
          version: 1,
          attemptCount: 0,
          originZoneId: 1,
          originTown: "Colombo Fort",
          destinationTown: "Kandy Town",
          courierId: state === "assigned" ? 10 : null,
          createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
        },
      ],
      nextCursor: null,
    });
  }),

  http.get("/api/v1/dispatch/couriers", () => {
    return HttpResponse.json({
      items: [
        {
          userId: 10,
          fullName: "Demo Courier",
          onDuty: true,
          capacity: 5,
          workload: 1,
          hasProfile: true,
        },
        {
          userId: 11,
          fullName: "Night Courier",
          onDuty: false,
          capacity: 5,
          workload: 0,
          hasProfile: true,
        },
      ],
    });
  }),

  http.patch(
    "/api/v1/dispatch/couriers/:courierId",
    async ({ params, request }) => {
      const body = (await request.json()) as {
        onDuty?: boolean;
        capacity?: number;
      };
      return HttpResponse.json({
        userId: Number(params["courierId"]),
        fullName: "Demo Courier",
        onDuty: body.onDuty ?? true,
        capacity: body.capacity ?? 5,
        workload: 1,
        hasProfile: true,
      });
    },
  ),

  http.post(
    "/api/v1/dispatch/parcels/:id/assign",
    async ({ params, request }) => {
      const body = (await request.json()) as {
        courierId: number;
        version: number;
      };
      return HttpResponse.json({
        parcelId: params["id"],
        courierId: body.courierId,
        version: body.version + 1,
        changed: true,
      });
    },
  ),

  http.get("/api/v1/courier/jobs", () => {
    return HttpResponse.json({
      profile: {
        userId: 10,
        fullName: "Demo Courier",
        onDuty: true,
        capacity: 5,
        workload: 1,
        hasProfile: true,
      },
      items: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          trackingNumber: "SD-4HNP6RTD-N",
          status: "OUT_FOR_DELIVERY",
          version: 4,
          attemptCount: 1,
          originTown: "Colombo Fort",
          destinationTown: "Kandy Town",
          recipientName: "Kamal Perera",
          recipientPhone: "+94771234567",
          recipientAddress: "12 Lake Road, Kandy",
          assignedAt: new Date().toISOString(),
        },
      ],
    });
  }),

  http.patch("/api/v1/courier/jobs/:id/status", async ({ request }) => {
    const body = (await request.json()) as { to: string; version: number };
    return HttpResponse.json({
      status: body.to,
      version: body.version + 1,
      attemptCount: 1,
      replayed: false,
    });
  }),

  http.post("/api/v1/courier/jobs/:id/proof", () => {
    return HttpResponse.json(
      {
        proofObjectKey: `proofs/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`,
      },
      { status: 201 },
    );
  }),

  http.patch("/api/v1/courier/duty", async ({ request }) => {
    const body = (await request.json()) as { onDuty: boolean };
    return HttpResponse.json({
      userId: 10,
      fullName: "Demo Courier",
      onDuty: body.onDuty,
      capacity: 5,
      workload: 1,
      hasProfile: true,
    });
  }),
];
