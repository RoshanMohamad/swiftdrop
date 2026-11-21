import { Router } from "express";
import {
  createMerchantApiClientSchema,
  merchantRegistrationSchema,
  merchantReviewSchema,
  merchantOrderRequestSchema,
  saveMerchantWebhookSchema,
  merchantOrderStatusSchema,
  merchantWebhookDeliveryQuerySchema,
  merchantWebhookDeliveryPageSchema,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { HttpError } from "../../shared/problem.js";
import { protectMutations } from "../../shared/mutations.js";
import type { RateLimiter } from "../../shared/rate-limit.js";
import { authenticate, requireRecentAuth, requireRole } from "../auth/index.js";
import type { AuthService } from "../auth/service.js";
import { MerchantsService } from "./service.js";
import {
  authenticateMerchantClient,
  requireMerchantScope,
} from "./machine-auth.js";
import type { ParcelService } from "../parcels/index.js";
import type { WebhooksService } from "../webhooks/service.js";

export function createMerchantsRouter(
  merchants: MerchantsService,
  parcels: ParcelService,
  auth: AuthService,
  limiter: RateLimiter,
  config: Config,
  webhooks: WebhooksService,
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
  router.post(
    "/merchant/orders",
    authenticateMerchantClient(merchants),
    requireMerchantScope("orders:write"),
    async (req, res) => {
      const principal = res.locals.principal;
      if (principal?.kind !== "merchant-client")
        throw new HttpError(
          403,
          "FORBIDDEN",
          "This action requires a merchant API client.",
        );
      res
        .status(201)
        .json(
          await parcels.createMerchantOrder(
            principal.merchantId,
            req.get("Idempotency-Key") ?? "",
            merchantOrderRequestSchema.parse(req.body),
          ),
        );
    },
  );
  router.get(
    "/merchant/orders",
    authenticate(auth),
    requireRole("MERCHANT"),
    async (req, res) => {
      const status =
        req.query.status === undefined
          ? undefined
          : merchantOrderStatusSchema.parse(req.query.status);
      res.json(await merchants.listOrders(res.locals.user.id, status));
    },
  );
  router.get(
    "/merchant/webhook-deliveries",
    authenticate(auth),
    requireRole("MERCHANT"),
    async (req, res) => {
      const query = merchantWebhookDeliveryQuerySchema.parse(req.query);
      const merchantId = await merchants.approvedMerchantId(res.locals.user.id);
      const page = await webhooks.list({
        merchantId,
        status: query.status,
        cursor: query.cursor,
        limit: query.limit,
      });
      res.json(
        merchantWebhookDeliveryPageSchema.parse({
          items: page.items.map(
            ({ eventId, eventType, status, createdAt, updatedAt }) => ({
              eventId,
              eventType,
              status,
              createdAt,
              updatedAt,
            }),
          ),
          nextCursor: page.nextCursor,
        }),
      );
    },
  );
  router.get(
    "/admin/merchants",
    authenticate(auth),
    requireRole("ADMIN"),
    async (_req, res) => res.json(await merchants.listForAdmin()),
  );
  router.get(
    "/merchant/clients",
    authenticate(auth),
    requireRole("MERCHANT"),
    async (_req, res) =>
      res.json(await merchants.listApiClients(res.locals.user.id)),
  );
  router.post(
    "/merchant/clients",
    protectMutations(config),
    authenticate(auth),
    requireRole("MERCHANT"),
    requireRecentAuth(auth),
    async (req, res) =>
      res
        .status(201)
        .json(
          await merchants.createApiClient(
            res.locals.user.id,
            createMerchantApiClientSchema.parse(req.body),
          ),
        ),
  );
  router.post(
    "/merchant/clients/:id/rotate",
    protectMutations(config),
    authenticate(auth),
    requireRole("MERCHANT"),
    requireRecentAuth(auth),
    async (req, res) => {
      const id = String(req.params.id);
      if (!isUuid(id))
        throw new HttpError(400, "INVALID_CLIENT", "API client id is invalid.");
      res.json(await merchants.rotateApiClient(res.locals.user.id, id));
    },
  );
  router.post(
    "/merchant/clients/:id/revoke",
    protectMutations(config),
    authenticate(auth),
    requireRole("MERCHANT"),
    requireRecentAuth(auth),
    async (req, res) => {
      const id = String(req.params.id);
      if (!isUuid(id))
        throw new HttpError(400, "INVALID_CLIENT", "API client id is invalid.");
      await merchants.revokeApiClient(res.locals.user.id, id);
      res.status(204).end();
    },
  );
  router.get(
    "/merchant/webhook",
    authenticate(auth),
    requireRole("MERCHANT"),
    async (_req, res) =>
      res.json(await merchants.getWebhookSettings(res.locals.user.id)),
  );
  router.put(
    "/merchant/webhook",
    protectMutations(config),
    authenticate(auth),
    requireRole("MERCHANT"),
    requireRecentAuth(auth),
    async (req, res) =>
      res.json(
        await merchants.saveWebhookSettings(
          res.locals.user.id,
          saveMerchantWebhookSchema.parse(req.body),
        ),
      ),
  );
  router.post(
    "/merchant/webhook/rotate-secret",
    protectMutations(config),
    authenticate(auth),
    requireRole("MERCHANT"),
    requireRecentAuth(auth),
    async (_req, res) =>
      res.json(await merchants.rotateWebhookSecret(res.locals.user.id)),
  );
  router.patch(
    "/admin/merchants/:id/review",
    protectMutations(config),
    authenticate(auth),
    requireRole("ADMIN"),
    requireRecentAuth(auth),
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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
