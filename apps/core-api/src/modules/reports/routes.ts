import { Router } from "express";
import { dailyReportQuerySchema } from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { ReportsService } from "./service.js";

export function createReportsRouter(
  reports: ReportsService,
  auth: AuthService,
  _limiter: RateLimiter,
  _config: Config,
) {
  const router = Router();
  const staff = [
    authenticate(auth),
    requireRole("ADMIN", "DISPATCHER"),
    requireCompleteProfile,
  ];

  // FR-I7: Daily operations reports (deliveries/day, success rate) + CSV export
  router.get("/admin/reports/daily", ...staff, async (req, res) => {
    const query = dailyReportQuerySchema.parse(req.query);
    const report = await reports.getDailyReport(query.from, query.to);

    if (query.format === "csv") {
      const csv = reports.exportToCsv(report);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="daily-delivery-report-${report.from}-to-${report.to}.csv"`,
      );
      res.send(csv);
      return;
    }

    res.json(report);
  });

  return router;
}
