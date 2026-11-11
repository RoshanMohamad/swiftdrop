import { Prisma, type Database } from "@swiftdrop/db";
import {
  merchantPageSchema,
  merchantRegistrationResultSchema,
  merchantSchema,
  type MerchantRegistration,
  type MerchantReview,
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
}
