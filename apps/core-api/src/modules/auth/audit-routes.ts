import { Router } from "express";
import { auditQuerySchema } from "@swiftdrop/contracts";
import type { Database } from "@swiftdrop/db";
import { HttpError } from "../../shared/problem.js";
import { authenticate, requireRole } from "./index.js";
import { listAuditEvents } from "./audit.js";
import type { AuthService } from "./service.js";

/**
 * Read-only, Admin only (a Dispatcher inherits nothing here). The trail holds account ids and
 * outcomes, never credentials, so it is safe to show, but it is still restricted: who signs in
 * and from which request is exactly what an attacker would like to read.
 */
export function createAuditRouter(db: Database, auth: AuthService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", authenticate(auth), requireRole("ADMIN"), async (req, res) => {
    const query = auditQuerySchema.parse(req.query);
    try {
      res.json(await listAuditEvents(db, query));
    } catch (error) {
      if (error instanceof RangeError)
        throw new HttpError(400, "CURSOR", "The page cursor is invalid.");
      throw error;
    }
  });
  return router;
}
