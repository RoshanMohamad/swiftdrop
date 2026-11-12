import { randomBytes } from "node:crypto";
import { Prisma, type Database, type User } from "@swiftdrop/db";
import {
  staffUserSchema,
  type AdminUser,
  type CreateStaff,
  type Role,
  type UserStatusChange,
} from "@swiftdrop/contracts";

import { HttpError, unauthorised } from "../../shared/problem.js";
import { hashPassword } from "../auth/password.js";
import { tokenHash } from "../auth/service.js";
import type { AuthMailer } from "../auth/mail.js";
import { revokeUserSessions } from "../auth/transactions.js";
import { lockAdministration } from "./admin.js";

export type AdminActor = { id: number; familyId: string; jti: string };

const invitationLifetime = 24 * 60 * 60 * 1000;
const resendCooldown = 60 * 1000;
const pageDefault = 25;
const pageMax = 100;
const summary = (user: User, invitationExpiresAt: Date | null): AdminUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  role: user.roleId,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
  invitationExpiresAt: invitationExpiresAt?.toISOString() ?? null,
});
const staffRole = (role: Role): role is "COURIER" | "DISPATCHER" =>
  role === "COURIER" || role === "DISPATCHER";

export class UsersService {
  constructor(
    private db: Database,
    private appOrigin: string,
    private mailer?: AuthMailer,
  ) {}

  private async lockUsers(tx: Prisma.TransactionClient, ids: number[]) {
    for (const id of [...new Set(ids)].sort((a, b) => a - b))
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  }

  private async assertAdmin(tx: Prisma.TransactionClient, context: AdminActor) {
    const grant = await tx.accessGrant.findUnique({
      where: { jti: context.jti },
      include: { family: { include: { user: true } } },
    });
    const now = new Date();
    if (
      !grant ||
      !grant.familyId ||
      !grant.family ||
      grant.familyId !== context.familyId ||
      grant.family.userId !== context.id ||
      grant.expiresAt <= now ||
      grant.family.revokedAt ||
      grant.family.idleExpiresAt <= now ||
      grant.family.absoluteExpiresAt <= now ||
      grant.family.user.status !== "ACTIVE" ||
      grant.family.roleAtAuthentication !== grant.family.user.roleId
    )
      throw unauthorised();
    if (grant.family.user.roleId !== "ADMIN")
      throw new HttpError(
        403,
        "FORBIDDEN",
        "You do not have permission for this action.",
      );
  }

  private async deliver(email: string, rawToken: string) {
    if (!this.mailer?.sendInvitation) return "failed" as const;
    const link = new URL("/auth/accept-invite", this.appOrigin);
    link.hash = new URLSearchParams({ token: rawToken }).toString();
    try {
      await this.mailer.sendInvitation(email, link.toString());
      return "sent" as const;
    } catch {
      return "failed" as const;
    }
  }

  async list(
    actorId: number,
    filters: {
      role?: Role;
      status?: User["status"];
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = filters.limit ?? pageDefault;
    if (!Number.isInteger(limit) || limit < 1 || limit > pageMax)
      throw new HttpError(400, "LIMIT", "Limit must be between 1 and 100.");
    let cursorId: number | undefined;
    if (filters.cursor) {
      try {
        const value = Buffer.from(filters.cursor, "base64url").toString("utf8");
        if (!/^\d+$/.test(value)) throw new Error();
        cursorId = Number(value);
        if (!Number.isSafeInteger(cursorId) || cursorId < 1) throw new Error();
      } catch {
        throw new HttpError(400, "CURSOR", "The page cursor is invalid.");
      }
    }
    const actor = await this.db.user.findUnique({
      where: { id: actorId },
      select: { id: true, roleId: true, status: true },
    });
    if (!actor || actor.status !== "ACTIVE" || actor.roleId !== "ADMIN")
      throw new HttpError(
        403,
        "FORBIDDEN",
        "You do not have permission for this action.",
      );
    const users = await this.db.user.findMany({
      where: {
        roleId: filters.role,
        status: filters.status,
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const hasMore = users.length > limit;
    const page = users.slice(0, limit);
    const invitations = page.length
      ? await this.db.staffInvitation.findMany({
          where: {
            userId: { in: page.map(({ id }) => id) },
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { generation: "desc" },
        })
      : [];
    const expiryByUser = new Map<number, Date>();
    for (const invitation of invitations)
      if (!expiryByUser.has(invitation.userId))
        expiryByUser.set(invitation.userId, invitation.expiresAt);
    return {
      items: page.map((user) =>
        summary(user, expiryByUser.get(user.id) ?? null),
      ),
      nextCursor: hasMore
        ? Buffer.from(String(page.at(-1)!.id)).toString("base64url")
        : null,
    };
  }

  async create(actor: AdminActor, input: CreateStaff) {
    if (!staffRole(input.role))
      throw new HttpError(400, "ROLE", "Choose a courier or dispatcher role.");
    const rawToken = randomBytes(32).toString("base64url");
    const now = new Date();
    let user: User;
    try {
      user = await this.db.$transaction(async (tx) => {
        await this.lockUsers(tx, [actor.id]);
        await this.assertAdmin(tx, actor);
        const created = await tx.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            phone: input.phone,
            roleId: input.role,
            status: "INVITED",
          },
        });
        await tx.staffInvitation.create({
          data: {
            userId: created.id,
            tokenHash: tokenHash(rawToken),
            generation: 1,
            expiresAt: new Date(now.getTime() + invitationLifetime),
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new HttpError(
          409,
          "EMAIL_EXISTS",
          "An account already uses this email address.",
        );
      throw error;
    }
    const delivery = await this.deliver(user.email, rawToken);
    return {
      user: staffUserSchema.parse(
        summary(user, new Date(now.getTime() + invitationLifetime)),
      ),
      delivery,
    };
  }

  async invitationAction(
    actor: AdminActor,
    targetId: number,
    action: "resend" | "revoke",
  ) {
    const now = new Date();
    const rawToken =
      action === "resend" ? randomBytes(32).toString("base64url") : null;
    const result = await this.db.$transaction(async (tx) => {
      await this.lockUsers(tx, [actor.id, targetId]);
      await this.assertAdmin(tx, actor);
      const user = await tx.user.findUnique({ where: { id: targetId } });
      if (!user)
        throw new HttpError(404, "NOT_FOUND", "This user does not exist.");
      if (!staffRole(user.roleId) || user.status !== "INVITED")
        throw new HttpError(
          409,
          "INVITATION_STATE",
          "Only invited staff can change invitation status.",
        );
      const latest = await tx.staffInvitation.findFirst({
        where: { userId: targetId },
        orderBy: { generation: "desc" },
      });
      if (!latest || latest.consumedAt)
        throw new HttpError(
          409,
          "INVITATION_STATE",
          "This user has no active invitation.",
        );
      if (action === "revoke") {
        if (latest.revokedAt || latest.expiresAt <= now)
          throw new HttpError(
            409,
            "INVITATION_STATE",
            "This invitation is no longer active.",
          );
        await tx.staffInvitation.update({
          where: { id: latest.id },
          data: { revokedAt: now },
        });
        return {
          user,
          expiresAt: null,
          rawToken: null,
          delivery: "not_sent" as const,
        };
      }
      if (latest.createdAt.getTime() + resendCooldown > now.getTime())
        throw new HttpError(
          429,
          "INVITATION_COOLDOWN",
          "Wait one minute before resending this invitation.",
        );
      await tx.$queryRaw`SELECT id FROM staff_invitations WHERE id = ${latest.id}::uuid FOR UPDATE`;
      await tx.staffInvitation.update({
        where: { id: latest.id },
        data: { revokedAt: now },
      });
      const expiresAt = new Date(now.getTime() + invitationLifetime);
      await tx.staffInvitation.create({
        data: {
          userId: targetId,
          tokenHash: tokenHash(rawToken!),
          generation: latest.generation + 1,
          expiresAt,
        },
      });
      return { user, expiresAt, rawToken, delivery: null };
    });
    const delivery = result.rawToken
      ? await this.deliver(result.user.email, result.rawToken)
      : result.delivery!;
    return {
      user: staffUserSchema.parse(summary(result.user, result.expiresAt)),
      delivery,
    };
  }

  async changeStatus(
    actor: AdminActor,
    targetId: number,
    status: UserStatusChange["status"],
  ) {
    return this.db.$transaction(async (tx) => {
      await lockAdministration(tx);
      await this.lockUsers(tx, [actor.id, targetId]);
      await this.assertAdmin(tx, actor);
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target)
        throw new HttpError(404, "NOT_FOUND", "This user does not exist.");
      if (target.status === "INVITED")
        throw new HttpError(
          409,
          "INVITATION_REQUIRED",
          "Invited users must accept their invitation to activate. Revoke an invitation to prevent acceptance.",
        );
      if (status === "SUSPENDED" && targetId === actor.id)
        throw new HttpError(
          409,
          "SELF_SUSPENSION",
          "You cannot suspend your own account.",
        );
      if (target.status === status) return summary(target, null);
      if (
        status === "SUSPENDED" &&
        target.roleId === "ADMIN" &&
        (await tx.user.count({
          where: { roleId: "ADMIN", status: "ACTIVE" },
        })) <= 1
      )
        throw new HttpError(
          409,
          "LAST_ADMIN",
          "The final active administrator cannot be suspended.",
        );
      if (
        status === "ACTIVE" &&
        !target.passwordHash &&
        !(target.roleId === "CUSTOMER" && target.googleSub)
      )
        throw new HttpError(
          409,
          "CREDENTIALS_REQUIRED",
          "This account has no usable sign-in credentials.",
        );
      const now = new Date();
      const updated = await tx.user.update({
        where: { id: targetId },
        data: { status },
      });
      await revokeUserSessions(
        tx,
        targetId,
        status === "SUSPENDED" ? "suspension" : "reactivation",
        now,
      );
      await tx.verificationToken.updateMany({
        where: { userId: targetId, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.staffInvitation.updateMany({
        where: { userId: targetId, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.oAuthTransaction.updateMany({
        where: { userId: targetId, consumedAt: null },
        data: { consumedAt: now },
      });
      return summary(updated, null);
    });
  }

  async accept(rawToken: string, password: string) {
    const hash = tokenHash(rawToken);
    const known = await this.db.staffInvitation.findUnique({
      where: { tokenHash: hash },
    });
    if (!known)
      throw new HttpError(
        400,
        "INVITATION_INVALID",
        "This invitation is invalid or expired.",
      );
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await this.lockUsers(tx, [known.userId]);
      await tx.$queryRaw`SELECT id FROM staff_invitations WHERE id = ${known.id}::uuid FOR UPDATE`;
      const [user, invitation] = await Promise.all([
        tx.user.findUnique({ where: { id: known.userId } }),
        tx.staffInvitation.findUnique({ where: { id: known.id } }),
      ]);
      const now = new Date();
      if (
        !user ||
        !invitation ||
        invitation.tokenHash !== hash ||
        invitation.consumedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= now ||
        user.status !== "INVITED" ||
        !staffRole(user.roleId)
      )
        throw new HttpError(
          400,
          "INVITATION_INVALID",
          "This invitation is invalid or expired.",
        );
      if (user.roleId === "COURIER")
        throw new HttpError(
          409,
          "COURIER_SETUP_PENDING",
          "Courier setup is not ready yet. Ask an administrator to complete courier setup.",
        );
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { consumedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, emailVerifiedAt: now, status: "ACTIVE" },
      });
    });
  }
}
