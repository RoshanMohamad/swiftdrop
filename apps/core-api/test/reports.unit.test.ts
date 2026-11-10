import { describe, expect, it } from "@jest/globals";
import { ReportsService } from "../src/modules/reports/service.js";
import type { Database } from "@swiftdrop/db";

describe("Daily Operations Reports Service (FR-I7, Design Doc §3.4)", () => {
  it("returns clean empty structure when no parcels exist in date range", async () => {
    const mockDb = {
      parcel: {
        findMany: async () => [],
      },
    } as unknown as Database;

    const service = new ReportsService(mockDb);
    const report = await service.getDailyReport("2026-11-01", "2026-11-07");

    expect(report.from).toBe("2026-11-01");
    expect(report.to).toBe("2026-11-07");
    expect(report.totalBooked).toBe(0);
    expect(report.totalDelivered).toBe(0);
    expect(report.totalFailed).toBe(0);
    expect(report.overallSuccessRatePercent).toBe(0);
    expect(report.days).toEqual([]);
  });

  it("correctly groups parcels by day and computes status aggregates and success rate", async () => {
    const parcels = [
      // Day 1: 2026-11-01 -> 3 total: 2 delivered, 1 failed (66.7% success)
      {
        id: "1",
        status: "DELIVERED",
        createdAt: new Date("2026-11-01T08:30:00Z"),
      },
      {
        id: "2",
        status: "DELIVERED",
        createdAt: new Date("2026-11-01T12:00:00Z"),
      },
      {
        id: "3",
        status: "FAILED",
        createdAt: new Date("2026-11-01T16:00:00Z"),
      },
      // Day 2: 2026-11-02 -> 2 total: 1 delivered, 1 in transit (100% terminal success)
      {
        id: "4",
        status: "DELIVERED",
        createdAt: new Date("2026-11-02T09:00:00Z"),
      },
      {
        id: "5",
        status: "IN_TRANSIT",
        createdAt: new Date("2026-11-02T14:00:00Z"),
      },
    ];

    const mockDb = {
      parcel: {
        findMany: async () => parcels,
      },
    } as unknown as Database;

    const service = new ReportsService(mockDb);
    const report = await service.getDailyReport("2026-11-01", "2026-11-02");

    expect(report.totalBooked).toBe(5);
    expect(report.totalDelivered).toBe(3);
    expect(report.totalFailed).toBe(1);
    // Overall: 3 delivered, 1 failed -> 3 / 4 = 75.0%
    expect(report.overallSuccessRatePercent).toBe(75.0);

    expect(report.days).toHaveLength(2);

    const [day1, day2] = report.days;
    expect(day1.date).toBe("2026-11-01");
    expect(day1.totalBooked).toBe(3);
    expect(day1.totalDelivered).toBe(2);
    expect(day1.totalFailed).toBe(1);
    expect(day1.totalInTransit).toBe(0);
    expect(day1.successRatePercent).toBe(66.7);

    expect(day2.date).toBe("2026-11-02");
    expect(day2.totalBooked).toBe(2);
    expect(day2.totalDelivered).toBe(1);
    expect(day2.totalFailed).toBe(0);
    expect(day2.totalInTransit).toBe(1);
    expect(day2.successRatePercent).toBe(100.0);
  });

  it("exports summary and rows to RFC 4180 CSV format", async () => {
    const service = new ReportsService({} as unknown as Database);
    const summary = {
      from: "2026-11-01",
      to: "2026-11-02",
      totalBooked: 5,
      totalDelivered: 3,
      totalFailed: 1,
      overallSuccessRatePercent: 75.0,
      days: [
        {
          date: "2026-11-01",
          totalBooked: 3,
          totalDelivered: 2,
          totalFailed: 1,
          totalInTransit: 0,
          successRatePercent: 66.7,
        },
        {
          date: "2026-11-02",
          totalBooked: 2,
          totalDelivered: 1,
          totalFailed: 0,
          totalInTransit: 1,
          successRatePercent: 100.0,
        },
      ],
    };

    const csv = service.exportToCsv(summary);
    expect(csv).toContain(
      "Date,Total Booked,Total Delivered,Total Failed,Total In Transit,Success Rate (%)",
    );
    expect(csv).toContain("2026-11-01,3,2,1,0,66.7");
    expect(csv).toContain("2026-11-02,2,1,0,1,100.0");
    expect(csv).toContain("SUMMARY,5,3,1,-,75.0");
  });

  it("handles single-day report with 100% delivery success", async () => {
    const parcels = [
      { id: "1", status: "DELIVERED", createdAt: new Date("2026-11-05T10:00:00Z") },
      { id: "2", status: "DELIVERED", createdAt: new Date("2026-11-05T14:00:00Z") },
    ];
    const mockDb = {
      parcel: { findMany: async () => parcels },
    } as unknown as Database;

    const service = new ReportsService(mockDb);
    const report = await service.getDailyReport("2026-11-05", "2026-11-05");

    expect(report.totalBooked).toBe(2);
    expect(report.totalDelivered).toBe(2);
    expect(report.totalFailed).toBe(0);
    expect(report.overallSuccessRatePercent).toBe(100.0);
    expect(report.days).toHaveLength(1);
    expect(report.days[0].successRatePercent).toBe(100.0);
  });

  it("handles days with only in-transit parcels without division by zero error", async () => {
    const parcels = [
      { id: "1", status: "IN_TRANSIT", createdAt: new Date("2026-11-06T10:00:00Z") },
    ];
    const mockDb = {
      parcel: { findMany: async () => parcels },
    } as unknown as Database;

    const service = new ReportsService(mockDb);
    const report = await service.getDailyReport("2026-11-06", "2026-11-06");

    expect(report.totalBooked).toBe(1);
    expect(report.totalDelivered).toBe(0);
    expect(report.totalFailed).toBe(0);
    expect(report.overallSuccessRatePercent).toBe(0);
    expect(report.days[0].totalInTransit).toBe(1);
    expect(report.days[0].successRatePercent).toBe(0);
  });
});
