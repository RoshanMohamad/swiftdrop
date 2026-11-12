import { Prisma, type Database } from "@swiftdrop/db";
import { createHash, randomBytes } from "node:crypto";
import {
  createMerchantApiClientSchema,
  merchantApiClientPageSchema,
  merchantApiClientSchema,
  merchantApiClientSecretSchema,
  merchantPageSchema,
  merchantRegistrationResultSchema,
  merchantSchema,
  type MerchantRegistration,
  type MerchantReview,
  type CreateMerchantApiClient,
} from "@swiftdrop/contracts";
import { hashPassword } from "../auth/password.js";
import { HttpError } from "../../shared/problem.js";

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
  constructor(private db: Database) {}

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
      return merchantApiClientSecretSchema.parse({
        client: clientSummary(updated),
        clientSecret: credential.clientSecret,
      });
    });
  }

  async revokeApiClient(userId: number, id: string) {
    const merchant = await this.approvedMerchant(userId);
    const changed = await this.db.merchantApiClient.updateMany({
      where: { id, merchantId: merchant.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (changed.count !== 1) {
      const exists = await this.db.merchantApiClient.findFirst({
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
  }
}
