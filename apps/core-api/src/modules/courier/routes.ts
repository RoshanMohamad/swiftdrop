import express, { Router } from "express";
import {
  courierDutySchema,
  courierStatusUpdateSchema,
  operationKeySchema,
  proofContentTypes,
  proofMaxBytes,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { HttpError } from "../../shared/problem.js";
import { protectMutations } from "../../shared/mutations.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { CourierService } from "./service.js";

function courierGuards(auth: AuthService) {
  // Courier-only: Admin does not inherit courier actions (Design Doc Table 3).
  return [authenticate(auth), requireRole("COURIER"), requireCompleteProfile];
}

/** JSON endpoints, mounted after express.json. */
export function createCourierRouter(
  service: CourierService,
  auth: AuthService,
  config: Config,
) {
  const router = Router();
  const courier = courierGuards(auth);
  router.use("/courier", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/courier/jobs", ...courier, async (_req, res) => {
    res.json(await service.jobs(res.locals.user.id));
  });
  router.patch(
    "/courier/jobs/:id/status",
    protectMutations(config),
    ...courier,
    async (req, res) => {
      const key = operationKeySchema.safeParse(req.get("Idempotency-Key"));
      if (!key.success)
        throw new HttpError(
          400,
          "OPERATION_KEY",
          "Send an Idempotency-Key header of 8-64 letters, digits, - or _.",
        );
      res.json(
        await service.updateStatus(
          res.locals.user.id,
          String(req.params.id),
          key.data,
          courierStatusUpdateSchema.parse(req.body),
        ),
      );
    },
  );
  router.patch(
    "/courier/duty",
    protectMutations(config),
    ...courier,
    async (req, res) => {
      res.json(
        await service.setDuty(
          res.locals.user.id,
          courierDutySchema.parse(req.body).onDuty,
        ),
      );
    },
  );
  return router;
}

/**
 * Binary photo upload. It must be mounted before express.json so the raw parser sees the body.
 * It is authenticated by a bearer token (not an ambient cookie), so the double-submit CSRF
 * token is replaced by an exact Origin check plus the 2 MB limit and a rate limit.
 */
export function createProofUploadRouter(
  service: CourierService,
  auth: AuthService,
  limiter: RateLimiter,
  config: Config,
) {
  const router = Router();
  router.post(
    "/api/v1/courier/jobs/:id/proof",
    limiter.middleware("proof-upload", 30, 60),
    (req, _res, next) =>
      next(
        req.get("origin") === config.APP_ORIGIN
          ? undefined
          : new HttpError(403, "ORIGIN", "Request origin is not allowed."),
      ),
    ...courierGuards(auth),
    express.raw({
      type: [...proofContentTypes],
      limit: proofMaxBytes,
    }),
    async (req, res) => {
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0)
        throw new HttpError(
          415,
          "UNSUPPORTED_IMAGE",
          "Upload a JPEG or PNG photo.",
        );
      res
        .status(201)
        .setHeader("Cache-Control", "no-store")
        .json(
          await service.uploadProof(
            res.locals.user.id,
            String(req.params.id),
            body,
            req.get("content-type")?.split(";")[0]?.trim(),
          ),
        );
    },
  );
  return router;
}
