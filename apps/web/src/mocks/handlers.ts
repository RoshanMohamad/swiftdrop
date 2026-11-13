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
    trackingNumber: "SD1234567A",
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
    return HttpResponse.json(mockAdminUser);
  }),

  http.post("/api/v1/auth/login", () => {
    return HttpResponse.json({
      state: "authenticated",
      accessToken: "mock-jwt-access-token",
      tokenType: "Bearer",
      expiresIn: 900,
      user: mockAdminUser,
    });
  }),

  http.post("/api/v1/auth/refresh", () => {
    return HttpResponse.json({
      state: "authenticated",
      accessToken: "mock-jwt-refreshed-token",
      tokenType: "Bearer",
      expiresIn: 900,
      user: mockAdminUser,
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
      message: "Registration successful. Please check your email to verify your account.",
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

  http.post("/api/v1/auth/complete-profile", async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    return HttpResponse.json({
      ...mockCustomerUser,
      fullName: body["fullName"] ?? mockCustomerUser.fullName,
      phone: body["phone"] ?? mockCustomerUser.phone,
      profileComplete: true,
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
      trackingNumber: "SD1234567A",
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
    const parcel = mockParcels.find((p) => p.id === params["id"]) || mockParcels[0]!;
    return HttpResponse.json(parcel);
  }),

  http.get("/api/v1/parcels/:id/receipt", () => {
    return HttpResponse.json({
      receiptReference: "SDR-SD1234567A",
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
      active: typeof body["active"] === "boolean" ? body["active"] : (existing?.active ?? true),
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
      effectiveFrom: (body["effectiveFrom"] as string) || new Date().toISOString(),
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
    const user = mockStaffUsers.find((u) => u.id === Number(params["id"])) || mockStaffUsers[0]!;
    return HttpResponse.json({
      user,
      delivery: "sent" as const,
    });
  }),

  http.patch("/api/v1/admin/users/:id/status", async ({ params, request }) => {
    const body = (await request.json()) as { status: "ACTIVE" | "SUSPENDED" };
    const user = mockStaffUsers.find((u) => u.id === Number(params["id"])) || mockStaffUsers[0]!;
    return HttpResponse.json({
      ...user,
      status: body.status,
    });
  }),

  // ── Merchants ───────────────────────────────────────────────────────────────
  http.post("/api/v1/merchant/register", () => {
    return HttpResponse.json({
      message: "Application submitted for review.",
    });
  }),

  http.get("/api/v1/admin/merchants", () => {
    return HttpResponse.json({
      items: mockMerchants,
    });
  }),

  http.patch("/api/v1/admin/merchants/:id/review", async ({ params, request }) => {
    const body = (await request.json()) as { status: "APPROVED" | "REJECTED" };
    const merchant = mockMerchants.find((m) => m.id === params["id"]) || mockMerchants[0]!;
    return HttpResponse.json({
      ...merchant,
      status: body.status,
      reviewedAt: new Date().toISOString(),
    });
  }),

  // ── Reports ─────────────────────────────────────────────────────────────────
  http.get("/api/v1/admin/reports/daily", () => {
    return HttpResponse.json(mockDailyReport);
  }),

  // ── Assistant ───────────────────────────────────────────────────────────────
  http.post("/api/v1/assistant/chat", () => {
    return HttpResponse.json({
      reply: "Hello! I am your SwiftDrop Assistant. I can help answer questions about deliveries, rates, or schedules.",
      toolsUsed: [],
    });
  }),
];
