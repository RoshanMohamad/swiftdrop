import { describe, expect, it } from "vitest";
import {
  handlers,
  mockAdminUser,
  mockCustomerUser,
  mockDailyReport,
  mockMerchants,
  mockParcels,
  mockPrices,
  mockStaffUsers,
  mockZones,
} from "./handlers.js";

describe("MSW Mock Handlers", () => {
  it("defines handlers for all critical SwiftDrop API endpoints", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(20);

    const paths = handlers.map((h) => ("info" in h ? (h.info as { path?: string }).path : undefined)).filter(Boolean);

    expect(paths).toContain("/api/v1/auth/csrf");
    expect(paths).toContain("/api/v1/auth/me");
    expect(paths).toContain("/api/v1/auth/login");
    expect(paths).toContain("/api/v1/quotes");
    expect(paths).toContain("/api/v1/parcels");
    expect(paths).toContain("/api/v1/admin/zones");
    expect(paths).toContain("/api/v1/admin/pricing");
    expect(paths).toContain("/api/v1/admin/users");
    expect(paths).toContain("/api/v1/admin/merchants");
    expect(paths).toContain("/api/v1/admin/reports/daily");
    expect(paths).toContain("/api/v1/assistant/chat");
  });

  it("exports valid mock user fixtures", () => {
    expect(mockCustomerUser.role).toBe("CUSTOMER");
    expect(mockCustomerUser.status).toBe("ACTIVE");
    expect(mockCustomerUser.emailVerified).toBe(true);

    expect(mockAdminUser.role).toBe("ADMIN");
    expect(mockAdminUser.status).toBe("ACTIVE");
  });

  it("exports valid parcel fixture matching tracking number format", () => {
    expect(mockParcels.length).toBeGreaterThan(0);
    const parcel = mockParcels[0]!;
    expect(parcel.trackingNumber).toMatch(/^SD[A-Z0-9]{8}$/);
    expect(parcel.currency).toBe("LKR");
    expect(parcel.history.length).toBeGreaterThan(0);
  });

  it("exports valid zones and pricing fixtures", () => {
    expect(mockZones.length).toBeGreaterThanOrEqual(2);
    expect(mockPrices.length).toBeGreaterThanOrEqual(1);
    expect(mockPrices[0]!.baseCents).toBeGreaterThan(0);
  });

  it("exports valid staff and merchant fixtures", () => {
    expect(mockStaffUsers.some((u) => u.role === "DISPATCHER")).toBe(true);
    expect(mockStaffUsers.some((u) => u.role === "COURIER")).toBe(true);
    expect(mockMerchants.length).toBeGreaterThan(0);
    expect(mockMerchants[0]!.status).toBe("PENDING");
  });

  it("exports valid daily report fixture", () => {
    expect(mockDailyReport.totalBooked).toBe(15);
    expect(mockDailyReport.overallSuccessRatePercent).toBe(80);
    expect(mockDailyReport.days.length).toBe(2);
  });
});
