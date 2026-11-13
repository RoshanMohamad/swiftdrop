import { Prisma, type Database } from "@swiftdrop/db";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  createMerchantApiClientSchema,
  merchantApiClientPageSchema,
  merchantApiClientSchema,
  merchantApiClientSecretSchema,
  merchantOAuthTokenResponseSchema,
  merchantWebhookSecretSchema,
  merchantWebhookSettingsSchema,
  saveMerchantWebhookResponseSchema,
  saveMerchantWebhookSchema,
  merchantPageSchema,
  merchantRegistrationResultSchema,
  merchantSchema,
  type MerchantRegistration,
  type MerchantReview,
  type CreateMerchantApiClient,
  type MerchantApiClientScope,
} from "@swiftdrop/contracts";
import type { TokenService } from "../auth/jwt.js";
import { hashPassword } from "../auth/password.js";
import { HttpError } from "../../shared/problem.js";
import { OAuthProtocolError } from "./oauth-error.js";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  newWebhookSecret,
  validateMerchantWebhookUrl,
} from "./webhook-security.js";

const merchantSummary = (merchant: {
  id: string;
  userId: number;
  businessName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  reviewedAt: Date | null;
  user: { email: string; fullName: string | null; phone: string | null };
}) =>
  merchantSchema.parse({
    id: merchant.id,
    userId: merchant.userId,
    email: merchant.user.email,
    fullName: merchant.user.fullName ?? "",
    phone: merchant.user.phone ?? "",
    businessName: merchant.businessName,
    status: merchant.status,
    createdAt: merchant.createdAt.toISOString(),
    reviewedAt: merchant.reviewedAt?.toISOString() ?? null,
  });

const secretHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const newCredential = () => ({
  clientId: `sd_cli_${randomBytes(18).toString("base64url")}`,
  clientSecret: `sd_sec_${randomBytes(32).toString("base64url")}`,
});
const clientSummary = (client: {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}) =>
  merchantApiClientSchema.parse({
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    scopes: client.scopes,
    createdAt: client.createdAt.toISOString(),
    rotatedAt: client.rotatedAt?.toISOString() ?? null,
    revokedAt: client.revokedAt?.toISOString() ?? null,
  });

export class MerchantsService {
  constructor(
    private db: Database,
    private tokens: TokenService,
    private webhookSecretRoot: string,
  ) {}

  async register(input: MerchantRegistration) {
    const passwordHash = await hashPassword(input.password);
    try {
      await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            phone: input.phone,
            passwordHash,
            roleId: "MERCHANT",
            status: "ACTIVE",
          },
        });
        await tx.merchant.create({
          data: {
            userId: user.id,
            businessName: input.businessName,
            status: "PENDING",
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return merchantRegistrationResultSchema.parse({
          message:
            "If the submitted details are eligible, the application is now pending review.",
        });
      throw error;
    }
    return merchantRegistrationResultSchema.parse({
      message:
        "If the submitted details are eligible, the application is now pending review.",
    });
  }

  async listForAdmin() {
    const merchants = await this.db.merchant.findMany({
      include: { user: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100,
    });
    return merchantPageSchema.parse({ items: merchants.map(merchantSummary) });
  }

  async review(
    id: string,
    actorId: number,
    decision: MerchantReview["status"],
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM merchants WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.merchant.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!current)
        throw new HttpError(404, "NOT_FOUND", "This merchant does not exist.");
      if (current.status !== "PENDING")
        throw new HttpError(
          409,
          "MERCHANT_ALREADY_REVIEWED",
          "Only pending merchant applications can be reviewed.",
        );
      const changed = await tx.merchant.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: decision,
          reviewedAt: new Date(),
          reviewedById: actorId,
        },
      });
      if (changed.count !== 1)
        throw new HttpError(
          409,
          "MERCHANT_ALREADY_REVIEWED",
          "Only pending merchant applications can be reviewed.",
        );
      const updated = await tx.merchant.findUniqueOrThrow({
        where: { id },
        include: { user: true },
      });
      return merchantSummary(updated);
    });
  }

  private async approvedMerchant(userId: number) {
    const merchant = await this.db.merchant.findUnique({ where: { userId } });
    if (!merchant)
      throw new HttpError(
        404,
        "MERCHANT_NOT_FOUND",
        "Merchant account was not found.",
      );
    if (merchant.status !== "APPROVED")
      throw new HttpError(
        403,
        "MERCHANT_NOT_APPROVED",
        "API access is available after merchant approval.",
      );
    return merchant;
  }

  async listApiClients(userId: number) {
    const merchant = await this.approvedMerchant(userId);
    const clients = await this.db.merchantApiClient.findMany({
      where: { merchantId: merchant.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100,
    });
    return merchantApiClientPageSchema.parse({
      items: clients.map(clientSummary),
    });
  }

  async createApiClient(userId: number, input: CreateMerchantApiClient) {
    const values = createMerchantApiClientSchema.parse(input);
    const merchant = await this.approvedMerchant(userId);
    const credential = newCredential();
    const client = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM merchants WHERE id = ${merchant.id}::uuid FOR UPDATE`;
      const existing = await tx.merchantApiClient.count({
        where: { merchantId: merchant.id, revokedAt: null },
      });
      if (existing >= 10)
        throw new HttpError(
          409,
          "CLIENT_LIMIT",
          "Revoke an unused API client before creating another.",
        );
      return tx.merchantApiClient.create({
        data: {
          merchantId: merchant.id,
          clientId: credential.clientId,
          name: values.name,
          scopes: values.scopes,
          secretHash: secretHash(credential.clientSecret),
        },
      });
    });
    return merchantApiClientSecretSchema.parse({
      client: clientSummary(client),
      clientSecret: credential.clientSecret,
    });
  }

  async rotateApiClient(userId: number, id: string) {
    const merchant = await this.approvedMerchant(userId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM merchant_api_clients WHERE id = ${id}::uuid AND merchant_id = ${merchant.id}::uuid FOR UPDATE`;
      const current = await tx.merchantApiClient.findFirst({
        where: { id, merchantId: merchant.id },
      });
      if (!current)
        throw new HttpError(
          404,
          "CLIENT_NOT_FOUND",
          "API client was not found.",
        );
      if (current.revokedAt)
        throw new HttpError(
          409,
          "CLIENT_REVOKED",
          "A revoked API client cannot be rotated.",
        );
      const credential = newCredential();
      const updated = await tx.merchantApiClient.update({
        where: { id },
        data: {
          secretHash: secretHash(credential.clientSecret),
          rotatedAt: new Date(),
        },
      });
      await tx.accessGrant.deleteMany({ where: { clientId: id } });
      return merchantApiClientSecretSchema.parse({
        client: clientSummary(updated),
        clientSecret: credential.clientSecret,
      });
    });
  }

  async revokeApiClient(userId: number, id: string) {
    const merchant = await this.approvedMerchant(userId);
    await this.db.$transaction(async (tx) => {
      const changed = await tx.merchantApiClient.updateMany({
        where: { id, merchantId: merchant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count === 1)
        await tx.accessGrant.deleteMany({ where: { clientId: id } });
      else {
        const exists = await tx.merchantApiClient.findFirst({
          where: { id, merchantId: merchant.id },
          select: { id: true },
        });
        if (!exists)
          throw new HttpError(
            404,
            "CLIENT_NOT_FOUND",
            "API client was not found.",
          );
      }
    });
  }

  async getWebhookSettings(userId: number) {
    const merchant = await this.approvedMerchant(userId);
    const config = await this.db.merchantWebhookConfig.findUnique({
      where: { merchantId: merchant.id },
    });
    return merchantWebhookSettingsSchema.parse({
      configured: Boolean(config),
      url: config?.url ?? null,
      updatedAt: config?.updatedAt.toISOString() ?? null,
    });
  }

  async saveWebhookSettings(userId: number, input: unknown) {
    const values = saveMerchantWebhookSchema.parse(input);
    const merchant = await this.approvedMerchant(userId);
    const url = await validateMerchantWebhookUrl(values.url);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM merchants WHERE id = ${merchant.id}::uuid FOR UPDATE`;
      const currentMerchant = await tx.merchant.findUnique({
        where: { id: merchant.id },
        include: { user: { select: { status: true } } },
      });
      if (
        !currentMerchant ||
        currentMerchant.status !== "APPROVED" ||
        currentMerchant.user.status !== "ACTIVE"
      )
        throw new HttpError(
          403,
          "MERCHANT_NOT_APPROVED",
          "Webhook settings require an active, approved merchant.",
        );
      const existing = await tx.merchantWebhookConfig.findUnique({
        where: { merchantId: merchant.id },
      });
      const signingSecret = existing ? null : newWebhookSecret();
      const config = existing
        ? await tx.merchantWebhookConfig.update({
            where: { merchantId: merchant.id },
            data: { url },
          })
        : await tx.merchantWebhookConfig.create({
            data: {
              merchantId: merchant.id,
              url,
              encryptedSecret: encryptWebhookSecret(
                signingSecret!,
                this.webhookSecretRoot,
              ),
            },
          });
      return saveMerchantWebhookResponseSchema.parse({
        settings: {
          configured: true,
          url: config.url,
          updatedAt: config.updatedAt.toISOString(),
        },
        signingSecret,
      });
    });
  }

  async rotateWebhookSecret(userId: number) {
    const merchant = await this.approvedMerchant(userId);
    const signingSecret = newWebhookSecret();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM merchants WHERE id = ${merchant.id}::uuid FOR UPDATE`;
      const currentMerchant = await tx.merchant.findUnique({
        where: { id: merchant.id },
        include: { user: { select: { status: true } } },
      });
      if (
        !currentMerchant ||
        currentMerchant.status !== "APPROVED" ||
        currentMerchant.user.status !== "ACTIVE"
      )
        throw new HttpError(
          403,
          "MERCHANT_NOT_APPROVED",
          "Webhook settings require an active, approved merchant.",
        );
      const existing = await tx.merchantWebhookConfig.findUnique({
        where: { merchantId: merchant.id },
      });
      if (!existing)
        throw new HttpError(
          404,
          "WEBHOOK_NOT_CONFIGURED",
          "Configure a webhook URL before rotating its signing secret.",
        );
      await tx.merchantWebhookConfig.update({
        where: { merchantId: merchant.id },
        data: {
          encryptedSecret: encryptWebhookSecret(
            signingSecret,
            this.webhookSecretRoot,
          ),
        },
      });
      return merchantWebhookSecretSchema.parse({ signingSecret });
    });
  }

  async webhookTargetForDelivery(merchantId: string) {
    const config = await this.db.merchantWebhookConfig.findUnique({
      where: { merchantId },
      include: {
        merchant: { include: { user: { select: { status: true } } } },
      },
    });
    if (
      !config ||
      config.merchant.status !== "APPROVED" ||
      config.merchant.user.status !== "ACTIVE"
    )
      return null;
    return {
      url: config.url,
      secret: decryptWebhookSecret(
        config.encryptedSecret,
        this.webhookSecretRoot,
      ),
    };
  }

  async issueOAuthToken(
    clientId: string,
    secret: string,
    requestedScopes?: MerchantApiClientScope[],
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM merchant_api_clients WHERE client_id = ${clientId} FOR UPDATE`;
      const client = await tx.merchantApiClient.findUnique({
        where: { clientId },
        include: { merchant: { include: { user: true } } },
      });
      const suppliedHash = createHash("sha256").update(secret).digest();
      const storedHash = client
        ? Buffer.from(client.secretHash, "hex")
        : Buffer.alloc(suppliedHash.length);
      const secretMatches =
        storedHash.length === suppliedHash.length &&
        timingSafeEqual(suppliedHash, storedHash);
      if (
        !client ||
        !secretMatches ||
        client.revokedAt ||
        client.merchant.status !== "APPROVED" ||
        client.merchant.user.status !== "ACTIVE"
      )
        throw new OAuthProtocolError(
          "invalid_client",
          401,
          "Client authentication failed.",
        );

      const allowed = client.scopes as MerchantApiClientScope[];
      const granted = requestedScopes ?? allowed;
      if (
        granted.length === 0 ||
        new Set(granted).size !== granted.length ||
        granted.some((scope) => !allowed.includes(scope))
      )
        throw new OAuthProtocolError(
          "invalid_scope",
          400,
          "The requested scope is not allowed for this client.",
        );
      const scopes = [...granted].sort();
      const token = await this.tokens.issueMerchantClient(clientId, scopes);
      await tx.accessGrant.create({
        data: {
          jti: token.jti,
          clientId: client.id,
          expiresAt: token.expiresAt,
        },
      });
      return merchantOAuthTokenResponseSchema.parse({
        access_token: token.accessToken,
        token_type: "Bearer",
        expires_in: 900,
        scope: scopes.join(" "),
      });
    });
  }

  async hasOAuthClient(clientId: string) {
    return Boolean(
      await this.db.merchantApiClient.findUnique({
        where: { clientId },
        select: { id: true },
      }),
    );
  }

  async authenticateOAuthToken(token: string) {
    const claims = await this.tokens.verifyMerchantClient(token);
    const grant = await this.db.accessGrant.findUnique({
      where: { jti: claims.jti },
      include: {
        client: { include: { merchant: { include: { user: true } } } },
      },
    });
    const now = new Date();
    const client = grant?.client;
    if (
      !grant ||
      grant.expiresAt <= now ||
      grant.familyId !== null ||
      !client ||
      grant.clientId !== client.id ||
      client.clientId !== claims.clientId ||
      client.revokedAt ||
      client.merchant.status !== "APPROVED" ||
      client.merchant.user.status !== "ACTIVE" ||
      claims.scopes.some((scope) => !client.scopes.includes(scope))
    )
      throw new OAuthProtocolError(
        "invalid_client",
        401,
        "The access token is no longer valid.",
      );
    return {
      kind: "merchant-client" as const,
      clientId: client.clientId,
      merchantId: client.merchantId,
      scopes: claims.scopes,
      jti: claims.jti,
    };
  }
}
