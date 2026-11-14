import { Router } from "express";
import {
  courierAssignmentInputSchema,
  dispatchAssignmentQuerySchema,
  dispatchQueueQuerySchema,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import { protectMutations } from "../../shared/mutations.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { DispatchService } from "./service.js";

export function createDispatchRouter(
  dispatch: DispatchService,
  auth: AuthService,
  _limiter: RateLimiter,
  config: Config,
) {
  const router = Router();
  const staff = [
    authenticate(auth),
    requireRole("DISPATCHER", "ADMIN"),
    requireCompleteProfile,
  ];

  router.get("/dispatch/parcels/unassigned", ...staff, async (req, res) => {
    res.json(await dispatch.listUnassigned(dispatchQueueQuerySchema.parse(req.query)));
  });

  router.get("/dispatch/couriers/capacity", ...staff, async (_req, res) => {
    res.json(await dispatch.listCourierCapacity());
  });

  router.get("/dispatch/assignments", ...staff, async (req, res) => {
    res.json(
      await dispatch.listAssignments(
        dispatchAssignmentQuerySchema.parse(req.query),
      ),
    );
  });

  router.get("/dispatch/history", ...staff, async (req, res) => {
    res.json(
      await dispatch.listAssignments(
        dispatchAssignmentQuerySchema.parse(req.query),
        { activeOnly: false },
      ),
    );
  });

  router.get(
    "/dispatch/assignments/:id",
    ...staff,
    async (req, res) => {
      res.json(await dispatch.getAssignment(String(req.params.id)));
    },
  );

  router.get(
    "/dispatch/parcels/:id/assignment",
    ...staff,
    async (req, res) => {
      res.json(await dispatch.getParcelAssignment(String(req.params.id)));
    },
  );

  router.put(
    "/dispatch/parcels/:id/assignment",
    protectMutations(config),
    ...staff,
    async (req, res) => {
      res.json(
        await dispatch.assign(
          String(req.params.id),
          courierAssignmentInputSchema.parse(req.body),
        ),
      );
    },
  );

  return router;
}
