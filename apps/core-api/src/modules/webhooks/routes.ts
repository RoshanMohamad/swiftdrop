import { Router } from "express";
import {
  webhookDeliveryStatusSchema,
  webhookReplayRequestSchema,
} from "@swiftdrop/contracts";
import { z } from "zod";
import type { Config } from "../../shared/config.js";
import { protectMutations } from "../../shared/mutations.js";
import { authenticate, requireRole } from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import type { WebhooksService } from "./service.js";

const filtersSchema = z
  .object({
    status: webhookDeliveryStatusSchema.optional(),
    merchantId: z.coerce.number().int().positive().optional(),
    cursor: z.string().max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Admin only: Dispatcher inherits nothing here (Design Doc Table 3: only Admin replays). */
export function createWebhooksRouter(
  webhooks: WebhooksService,
  auth: AuthService,
  config: Config,
) {
  const router = Router();
  const admin = [authenticate(auth), requireRole("ADMIN")];
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", ...admin, async (req, res) => {
    res.json(await webhooks.list(filtersSchema.parse(req.query)));
  });
  router.get("/:id", ...admin, async (req, res) => {
    res.json(await webhooks.detail(String(req.params.id)));
  });
  router.post(
    "/:id/replay",
    protectMutations(config),
    ...admin,
    async (req, res) => {
      const { reason } = webhookReplayRequestSchema.parse(req.body);
      res
        .status(202)
        .json(
          await webhooks.replay(
            res.locals.user.id,
            String(req.params.id),
            reason,
          ),
        );
    },
  );
  return router;
}
