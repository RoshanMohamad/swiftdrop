import { Router } from "express";
import { z } from "zod";
import {
  assignParcelSchema,
  courierProfileUpdateSchema,
  dispatchStateSchema,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { protectMutations } from "../../shared/mutations.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { DispatchService } from "./service.js";

const filtersSchema = z
  .object({
    state: dispatchStateSchema.default("unassigned"),
    zoneId: z.coerce.number().int().positive().optional(),
    cursor: z.string().max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
const courierParam = z.coerce.number().int().positive();

/** Dispatcher and Admin only (Admin inherits Dispatcher operations in requireRole). */
export function createDispatchRouter(
  service: DispatchService,
  auth: AuthService,
  config: Config,
) {
  const router = Router();
  const staff = [
    authenticate(auth),
    requireRole("DISPATCHER"),
    requireCompleteProfile,
  ];
  router.use("/dispatch", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/dispatch/parcels", ...staff, async (req, res) => {
    res.json(await service.listParcels(filtersSchema.parse(req.query)));
  });
  router.get("/dispatch/couriers", ...staff, async (_req, res) => {
    res.json({ items: await service.listCouriers() });
  });
  router.patch(
    "/dispatch/couriers/:courierId",
    protectMutations(config),
    ...staff,
    async (req, res) => {
      res.json(
        await service.updateProfile(
          courierParam.parse(req.params.courierId),
          courierProfileUpdateSchema.parse(req.body),
        ),
      );
    },
  );
  router.post(
    "/dispatch/parcels/:id/assign",
    protectMutations(config),
    ...staff,
    async (req, res) => {
      const body = assignParcelSchema.parse(req.body);
      res.json(
        await service.assign(
          res.locals.user.id,
          String(req.params.id),
          body.courierId,
          body.version,
        ),
      );
    },
  );
  return router;
}
