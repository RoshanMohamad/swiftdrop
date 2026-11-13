import { Router } from "express";
import {
  merchantRegistrationSchema,
  merchantReviewSchema,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { HttpError } from "../../shared/problem.js";
import { protectMutations } from "../../shared/mutations.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import { authenticate, requireRole } from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import { MerchantsService } from "./service.js";

export function createMerchantsRouter(
  merchants: MerchantsService,
  auth: AuthService,
  limiter: RateLimiter,
  config: Config,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post(
    "/merchant/register",
    limiter.middleware("merchant-register", 5, 900),
    protectMutations(config),
    async (req, res) => {
      res
        .status(201)
        .json(
          await merchants.register(merchantRegistrationSchema.parse(req.body)),
        );
    },
  );
  router.get(
    "/admin/merchants",
    authenticate(auth),
    requireRole("ADMIN"),
    async (_req, res) => res.json(await merchants.listForAdmin()),
  );
  router.patch(
    "/admin/merchants/:id/review",
    protectMutations(config),
    authenticate(auth),
    requireRole("ADMIN"),
    async (req, res) => {
      const id = String(req.params.id);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new HttpError(400, "INVALID_MERCHANT", "Merchant id is invalid.");
      const { status } = merchantReviewSchema.parse(req.body);
      res.json(await merchants.review(id, res.locals.user.id, status));
    },
  );
  return router;
}
