import type { Database } from "@swiftdrop/db";
import type { DailyReportItem, DailyReportSummary } from "@swiftdrop/contracts";

/**
 * Daily Operations Reports Service (FR-I7)
 *
 * Provides aggregation of delivery throughput, terminal failure rates,
 * and operational success rates across customizable date windows.
 * Generates RFC 4180 standard CSV exports for offline spreadsheet auditing.
 *
 * @see plan.md §2.4 (Async Integration & Operations Reporting)
 * @see SWIFTDROP_DESIGN_DOCUMENTATION.md §3.4
 */
export class ReportsService {
  constructor(private db: Database) {}

  /**
   * Aggregates daily deliveries, terminal outcomes, and success rates.
   * Conforms to FR-I7 and Design Doc §3.4.
   *
   * @param fromStr Start date in YYYY-MM-DD or ISO timestamp format. Defaults to 14 days ago.
   * @param toStr End date in YYYY-MM-DD or ISO timestamp format. Defaults to now.
   * @returns DailyReportSummary containing KPI totals and daily breakdown items.
   */
  async getDailyReport(
    fromStr?: string,
    toStr?: string,
  ): Promise<DailyReportSummary> {
    const to = toStr ? new Date(toStr) : new Date();
    // Default to last 14 days if from is not specified
    const from = fromStr
      ? new Date(fromStr)
      : new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Fetch all parcels in the date range
    const parcels = await this.db.parcel.findMany({
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by YYYY-MM-DD
    const dayMap = new Map<
      string,
      {
        totalBooked: number;
        totalDelivered: number;
        totalFailed: number;
        totalInTransit: number;
      }
    >();

    for (const p of parcels) {
      const dateKey = p.createdAt.toISOString().slice(0, 10);
      const current = dayMap.get(dateKey) ?? {
        totalBooked: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalInTransit: 0,
      };

      current.totalBooked += 1;
      if (p.status === "DELIVERED") {
        current.totalDelivered += 1;
      } else if (p.status === "FAILED") {
        current.totalFailed += 1;
      } else if (
        p.status === "IN_TRANSIT" ||
        p.status === "PICKED_UP" ||
        p.status === "OUT_FOR_DELIVERY"
      ) {
        current.totalInTransit += 1;
      }

      dayMap.set(dateKey, current);
    }

    const days: DailyReportItem[] = [];
    let overallBooked = 0;
    let overallDelivered = 0;
    let overallFailed = 0;

    for (const [date, counts] of dayMap.entries()) {
      const terminal = counts.totalDelivered + counts.totalFailed;
      const rate =
        terminal > 0
          ? Math.round((counts.totalDelivered / terminal) * 1000) / 10
          : counts.totalDelivered > 0
            ? 100
            : 0;

      days.push({
        date,
        totalBooked: counts.totalBooked,
        totalDelivered: counts.totalDelivered,
        totalFailed: counts.totalFailed,
        totalInTransit: counts.totalInTransit,
        successRatePercent: Math.min(100, Math.max(0, rate)),
      });

      overallBooked += counts.totalBooked;
      overallDelivered += counts.totalDelivered;
      overallFailed += counts.totalFailed;
    }

    // Sort chronologically
    days.sort((a, b) => a.date.localeCompare(b.date));

    const totalTerminal = overallDelivered + overallFailed;
    const overallRate =
      totalTerminal > 0
        ? Math.round((overallDelivered / totalTerminal) * 1000) / 10
        : overallDelivered > 0
          ? 100
          : 0;

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      totalBooked: overallBooked,
      totalDelivered: overallDelivered,
      totalFailed: overallFailed,
      overallSuccessRatePercent: Math.min(100, Math.max(0, overallRate)),
      days,
    };
  }

  /**
   * Converts a daily report summary into RFC 4180 compliant CSV.
   * Uses standard CRLF (\r\n) line terminators and generates both
   * individual daily line items and an aggregated summary footer line.
   *
   * @param summary The DailyReportSummary to serialize.
   * @returns Formatted RFC 4180 CSV string ready for download attachment.
   */
  exportToCsv(summary: DailyReportSummary): string {
    const header = [
      "Date",
      "Total Booked",
      "Total Delivered",
      "Total Failed",
      "Total In Transit",
      "Success Rate (%)",
    ].join(",");

    const rows = summary.days.map((day) =>
      [
        day.date,
        day.totalBooked,
        day.totalDelivered,
        day.totalFailed,
        day.totalInTransit,
        day.successRatePercent.toFixed(1),
      ].join(","),
    );

    const summaryLine = [
      "SUMMARY",
      summary.totalBooked,
      summary.totalDelivered,
      summary.totalFailed,
      "-",
      summary.overallSuccessRatePercent.toFixed(1),
    ].join(",");

    return [header, ...rows, "", summaryLine].join("\r\n");
  }
}
