import { Router } from "express";
import type { Config } from "../../shared/config.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { ReceiptService } from "./service.js";

export function createReceiptRouter(
  receipts: ReceiptService,
  auth: AuthService,
  _config: Config,
) {
  const router = Router();
  router.get(
    "/parcels/:id/receipt",
    authenticate(auth),
    requireRole("CUSTOMER"),
    requireCompleteProfile,
    async (req, res) => {
      res.json(
        await receipts.getDownloadUrl(
          res.locals.user.id,
          String(req.params.id),
        ),
      );
    },
  );
  return router;
}
