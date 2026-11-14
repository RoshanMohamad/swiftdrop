import { Router } from "express";
import {
  priceInputSchema,
  quoteRequestSchema,
  zoneInputSchema,
} from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import { protectMutations } from "../../shared/mutations.js";
import type { Config } from "../../shared/config.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { PricingService } from "./service.js";

export function createPricingRouter(
  service: PricingService,
  auth: AuthService,
  limiter: RateLimiter,
  config: Config,
) {
  const router = Router();
  const customer = [
    authenticate(auth),
    requireRole("CUSTOMER"),
    requireCompleteProfile,
  ];
  const admin = [
    authenticate(auth),
    requireRole("ADMIN"),
    requireCompleteProfile,
  ];

  // FR-P2: Delivery quotes engine
  router.post(
    "/quotes",
    protectMutations(config),
    ...customer,
    async (req, res) => {
      res
        .status(201)
        .json(
          await service.createQuote(
            res.locals.user.id,
            quoteRequestSchema.parse(req.body),
          ),
        );
    },
  );

  // List zones (accessible for booking and admin)
  router.get("/zones", async (_req, res) => {
    res.json(await service.listZones());
  });

  // FR-P1 / FR-F5: Admin Zones Management
  router.get("/admin/zones", ...admin, async (_req, res) =>
    res.json(await service.listZones()),
  );

  router.post(
    "/admin/zones",
    protectMutations(config),
    ...admin,
    async (req, res) =>
      res
        .status(201)
        .json(await service.createZone(zoneInputSchema.parse(req.body))),
  );

  router.patch(
    "/admin/zones/:id",
    protectMutations(config),
    ...admin,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1)
        throw new HttpError(400, "INVALID_ZONE", "District id is invalid.");
      res.json(await service.updateZone(id, zoneInputSchema.parse(req.body)));
    },
  );

  router.delete(
    "/admin/zones/:id",
    protectMutations(config),
    ...admin,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1)
        throw new HttpError(400, "INVALID_ZONE", "District id is invalid.");
      await service.deleteZone(id);
      res.status(204).end();
    },
  );

  // FR-P1 / FR-F5: Admin Pricing Rules
  router.get("/admin/pricing", ...admin, async (_req, res) =>
    res.json(await service.listPrices()),
  );

  router.post(
    "/admin/pricing",
    protectMutations(config),
    ...admin,
    async (req, res) =>
      res
        .status(201)
        .json(await service.createPrice(priceInputSchema.parse(req.body))),
  );

  return router;
}
