import { Router } from "express";
import { statusTransitionSchema, cancelParcelSchema } from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import { protectMutations } from "../../shared/mutations.js";
import type { LifecycleService } from "./service.js";

export function createLifecycleRouter(
  service: LifecycleService,
  auth: AuthService,
  limiter: RateLimiter,
  config: Config,
) {
  const router = Router();

  const staff = [
    authenticate(auth),
    requireRole("DISPATCHER", "ADMIN"),
    requireCompleteProfile,
  ];

  const customerOrStaff = [
    authenticate(auth),
    requireRole("CUSTOMER", "DISPATCHER", "ADMIN"),
    requireCompleteProfile,
  ];

  // Staff operational status update (FR-F8 / FR-P4)
  router.patch(
    "/parcels/:id/status",
    protectMutations(config),
    ...staff,
    async (req, res) => {
      const body = statusTransitionSchema.parse(req.body);
      const result = await service.transition(
        String(req.params.id),
        body.to,
        body.town,
        body.version,
      );
      res.json(result);
    },
  );

  // Pre-pickup cancellation (FR-P9)
  router.post(
    "/parcels/:id/cancel",
    protectMutations(config),
    ...customerOrStaff,
    async (req, res) => {
      const { version } = cancelParcelSchema.parse(req.body);
      const result = await service.cancel(
        String(req.params.id),
        res.locals.user.id,
        res.locals.user.role,
        version,
      );
      res.json(result);
    },
  );

  return router;
}
