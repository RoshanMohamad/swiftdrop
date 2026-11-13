import { createHash, randomBytes } from "node:crypto";
import {
  Prisma,
  type Database,
  type User,
  type AuthSession,
} from "@swiftdrop/db";
import type {
  PublicUser,
  Registration,
  Session,
  Role,
} from "@swiftdrop/contracts";
import type { Config } from "../../shared/config.js";
import { HttpError, unauthorised } from "../../shared/problem.js";
import { hashPassword } from "./password.js";
import type { TokenService } from "./jwt.js";
import type { AuthMailer } from "./mail.js";
import {
  decryptVerifier,
  encryptVerifier,
  GoogleOidc,
  type GoogleIdentity,
} from "./google.js";
import { checkPassword } from "./password.js";
import * as oidc from "openid-client";
import type { Logger } from "pino";
import { revokeUserSessions } from "./transactions.js";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const validRefresh = (token: unknown): token is string =>
  typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
export const publicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  role: user.roleId,
  status: "ACTIVE",
  emailVerified: Boolean(user.emailVerifiedAt),
  profileComplete: Boolean(user.fullName && user.phone),
});
type Tx = Prisma.TransactionClient;
type Credentials = {
  response: Session;
  refreshToken: string;
  cookieExpires: Date;
};
export class AuthService {
  constructor(
    private db: Database,
    private tokens: TokenService,
    private config: Pick<
      Config,
      | "CUSTOMER_IDLE_SECONDS"
      | "CUSTOMER_ABSOLUTE_SECONDS"
      | "STAFF_IDLE_SECONDS"
      | "STAFF_ABSOLUTE_SECONDS"
      | "APP_ORIGIN"
      | "GOOGLE_CLIENT_ID"
      | "GOOGLE_CLIENT_SECRET"
      | "GOOGLE_CALLBACK_URL"
      | "oauthSecret"
    >,
    private mailer?: AuthMailer,
    private google = new GoogleOidc(config),
    private logger?: Pick<Logger, "warn">,
  ) {}
  private async lockUser(tx: Tx, id: number) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  }
  private limits(role: Role) {
    const staff = ["COURIER", "DISPATCHER", "ADMIN"].includes(role);
    return {
      idle: staff
        ? this.config.STAFF_IDLE_SECONDS
        : this.config.CUSTOMER_IDLE_SECONDS,
      absolute: staff
        ? this.config.STAFF_ABSOLUTE_SECONDS
        : this.config.CUSTOMER_ABSOLUTE_SECONDS,
    };
  }
  googleAvailable() {
    return this.google.enabled();
  }
  async beginGoogle(
    intent: "login" | "link",
    binding?: { userId: number; familyId: string; passwordHash: string },
  ) {
    if (!this.google.enabled())
      throw new HttpError(
        503,
        "GOOGLE_UNAVAILABLE",
        "Google sign-in is not configured.",
      );
    const state = randomBytes(32).toString("base64url");
    const browser = randomBytes(32).toString("base64url");
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const url = await this.google.authorizationUrl(state, nonce, verifier);
    await this.db.oAuthTransaction.create({
      data: {
        stateHash: tokenHash(state),
        nonce,
        encryptedVerifier: encryptVerifier(verifier, this.config.oauthSecret),
        browserHash: tokenHash(browser),
        intent,
        userId: binding?.userId,
        familyId: binding?.familyId,
        passwordHash: binding?.passwordHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return { state, browser, url };
  }
  async beginGoogleLink(userId: number, familyId: string, password: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.roleId !== "CUSTOMER" ||
      user.status !== "ACTIVE" ||
      !user.passwordHash ||
      !(await checkPassword(password, user.passwordHash))
    )
      throw unauthorised();
    const family = await this.db.authSession.findUnique({
      where: { id: familyId },
    });
    if (
      !family ||
      family.userId !== userId ||
      family.revokedAt ||
      family.absoluteExpiresAt <= new Date() ||
      family.idleExpiresAt <= new Date()
    )
      throw unauthorised();
    if (user.googleSub)
      throw new HttpError(
        409,
        "GOOGLE_ALREADY_LINKED",
        "A Google account is already linked.",
      );
    return this.beginGoogle("link", {
      userId,
      familyId,
      passwordHash: user.passwordHash,
    });
  }
  async completeGoogle(url: URL, rawState: string, browser: string) {
    const stateHash = tokenHash(rawState);
    const tx = await this.db.oAuthTransaction.findUnique({
      where: { stateHash },
    });
    if (
      !tx ||
      tx.consumedAt ||
      tx.expiresAt <= new Date() ||
      tokenHash(browser) !== tx.browserHash
    )
      throw new HttpError(
        400,
        "GOOGLE_TRANSACTION",
        "This Google sign-in expired. Start again.",
      );
    let identity: GoogleIdentity;
    try {
      identity = await this.google.exchange(
        url,
        rawState,
        tx.nonce,
        decryptVerifier(tx.encryptedVerifier, this.config.oauthSecret),
      );
    } catch {
      await this.db.oAuthTransaction.updateMany({
        where: { id: tx.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw new HttpError(
        400,
        "GOOGLE_RESPONSE",
        "Google sign-in could not be completed. Try again.",
      );
    }
    try {
      const boundUserId =
        tx.userId ??
        (
          await this.db.user.findUnique({
            where: { googleSub: identity.sub },
            select: { id: true },
          })
        )?.id;
      return await this.db.$transaction(async (dbtx) => {
        // Suspension also invalidates OAuth actions: keep user → action lock order.
        if (boundUserId) await this.lockUser(dbtx, boundUserId);
        await dbtx.$queryRaw`SELECT id FROM oauth_transactions WHERE id = ${tx.id}::uuid FOR UPDATE`;
        const current = await dbtx.oAuthTransaction.findUnique({
          where: { id: tx.id },
        });
        if (
          !current ||
          current.consumedAt ||
          current.expiresAt <= new Date() ||
          current.browserHash !== tokenHash(browser)
        )
          throw new HttpError(
            400,
            "GOOGLE_TRANSACTION",
            "This Google sign-in expired. Start again.",
          );
        const now = new Date();
        if (current.intent === "link") {
          const userId = current.userId!;
          await this.lockUser(dbtx, userId);
          const user = await dbtx.user.findUnique({ where: { id: userId } });
          const family = await dbtx.authSession.findUnique({
            where: { id: current.familyId! },
          });
          const collision = await dbtx.user.findUnique({
            where: { googleSub: identity.sub },
          });
          if (
            !user ||
            user.status !== "ACTIVE" ||
            user.roleId !== "CUSTOMER" ||
            user.passwordHash !== current.passwordHash ||
            user.googleSub ||
            !family ||
            family.userId !== userId ||
            family.revokedAt ||
            family.absoluteExpiresAt <= now ||
            family.idleExpiresAt <= now ||
            user.email !== identity.email ||
            (collision && collision.id !== userId)
          )
            throw new HttpError(
              409,
              "GOOGLE_LINK_REJECTED",
              "This Google account cannot be linked. Sign in again and retry.",
            );
          await dbtx.user.update({
            where: { id: userId },
            data: {
              googleSub: identity.sub,
              emailVerifiedAt: user.emailVerifiedAt ?? now,
            },
          });
          await dbtx.oAuthTransaction.update({
            where: { id: tx.id },
            data: { consumedAt: now },
          });
          return { type: "linked" as const };
        }
        let user = await dbtx.user.findUnique({
          where: { googleSub: identity.sub },
        });
        let userLocked = false;
        if (user) {
          await this.lockUser(dbtx, user.id);
          userLocked = true;
          user = await dbtx.user.findUnique({ where: { id: user.id } });
          if (!user || user.status !== "ACTIVE" || user.roleId !== "CUSTOMER")
            throw new HttpError(
              409,
              "GOOGLE_ACCOUNT_REJECTED",
              "This account cannot sign in with Google.",
            );
        }
        if (!user) {
          const emailMatch = await dbtx.user.findUnique({
            where: { email: identity.email },
          });
          if (emailMatch) {
            await dbtx.oAuthTransaction.update({
              where: { id: tx.id },
              data: { consumedAt: now },
            });
            return { type: "account_exists" as const };
          }
          user = await dbtx.user.create({
            data: {
              email: identity.email,
              fullName: identity.fullName,
              phone: null,
              googleSub: identity.sub,
              emailVerifiedAt: now,
              roleId: "CUSTOMER",
              status: "ACTIVE",
            },
          });
        }
        if (!userLocked) await this.lockUser(dbtx, user.id);
        const family = await dbtx.authSession.create({
          data: {
            userId: user.id,
            roleAtAuthentication: user.roleId,
            idleExpiresAt: new Date(
              now.getTime() +
                Math.min(
                  this.limits(user.roleId).idle,
                  this.limits(user.roleId).absolute,
                ) *
                  1000,
            ),
            absoluteExpiresAt: new Date(
              now.getTime() + this.limits(user.roleId).absolute * 1000,
            ),
          },
        });
        const credentials = await this.credentials(dbtx, user, family);
        await dbtx.oAuthTransaction.update({
          where: { id: tx.id },
          data: { consumedAt: now },
        });
        return { type: "authenticated" as const, ...credentials };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        await this.db.oAuthTransaction.updateMany({
          where: { id: tx.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        throw new HttpError(
          409,
          "GOOGLE_ACCOUNT_EXISTS",
          "That Google account could not be linked automatically. Sign in with your password and link it in security settings.",
        );
      }
      throw error;
    }
  }
  async cancelGoogle(rawState: string, browser: string) {
    await this.db.oAuthTransaction.updateMany({
      where: {
        stateHash: tokenHash(rawState),
        browserHash: tokenHash(browser),
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  }
  async completeProfile(
    userId: number,
    input: { fullName: string; phone: string },
  ) {
    const user = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (
        !current ||
        current.status !== "ACTIVE" ||
        current.roleId !== "CUSTOMER" ||
        !current.googleSub
      )
        throw unauthorised();
      if (current.fullName && current.phone)
        throw new HttpError(
          409,
          "PROFILE_COMPLETE",
          "This profile is already complete.",
        );
      return tx.user.update({ where: { id: userId }, data: input });
    });
    return user;
  }
  async register(input: Registration) {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.db.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          passwordHash,
          roleId: "CUSTOMER",
          status: "ACTIVE",
        },
      });
      await this.sendVerification(user.id, user.email);
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ))
        throw error;
    }
  }
  private async sendVerification(userId: number, email: string) {
    if (!this.mailer) return;
    const raw = randomBytes(32).toString("base64url");
    const token = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        user.emailVerifiedAt ||
        user.status !== "ACTIVE" ||
        user.roleId !== "CUSTOMER"
      )
        return null;
      const latest = await tx.verificationToken.findFirst({
        where: { userId },
        orderBy: { generation: "desc" },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 60_000)
        return null;
      const generation = (latest?.generation ?? 0) + 1;
      await tx.verificationToken.updateMany({
        where: { userId, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.verificationToken.create({
        data: {
          userId,
          tokenHash: tokenHash(raw),
          generation,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return raw;
    });
    if (!token) return;
    try {
      await this.mailer.sendVerification(
        email,
        `${this.config.APP_ORIGIN}/auth/verify-email#token=${token}`,
      );
    } catch {
      // The account and hashed token remain valid; generic resend can recover delivery.
      this.logger?.warn({ event: "verification_delivery_failed" });
    }
  }
  async resendVerification(email: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (user) await this.sendVerification(user.id, user.email);
  }
  async verifyEmail(raw: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new HttpError(
        400,
        "INVALID_VERIFICATION",
        "This verification link is invalid or expired.",
      );
    const hash = tokenHash(raw);
    const known = await this.db.verificationToken.findUnique({
      where: { tokenHash: hash },
      select: { userId: true },
    });
    if (!known)
      throw new HttpError(
        400,
        "INVALID_VERIFICATION",
        "This verification link is invalid or expired.",
      );
    const verified = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, known.userId);
      const user = await tx.user.findUnique({ where: { id: known.userId } });
      const token = await tx.verificationToken.findUnique({
        where: { tokenHash: hash },
      });
      const now = new Date();
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !token ||
        token.consumedAt ||
        token.revokedAt ||
        token.expiresAt <= now
      )
        return false;
      await tx.verificationToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
      await tx.verificationToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
    if (!verified)
      throw new HttpError(
        400,
        "INVALID_VERIFICATION",
        "This verification link is invalid or expired.",
      );
  }
  private async credentials(
    tx: Tx,
    user: User,
    family: AuthSession,
    parentId?: string,
  ): Promise<Credentials> {
    const refreshToken = randomBytes(32).toString("base64url");
    const grant = await this.tokens.issue(user.id, user.roleId);
    await tx.refreshToken.create({
      data: {
        tokenHash: tokenHash(refreshToken),
        familyId: family.id,
        parentId,
        expiresAt: family.absoluteExpiresAt,
      },
    });
    await tx.accessGrant.create({
      data: { jti: grant.jti, familyId: family.id, expiresAt: grant.expiresAt },
    });
    return {
      refreshToken,
      cookieExpires: new Date(
        Math.min(
          family.idleExpiresAt.getTime(),
          family.absoluteExpiresAt.getTime(),
        ),
      ),
      response: {
        state: "authenticated",
        accessToken: grant.accessToken,
        tokenType: "Bearer",
        expiresIn: 900,
        user: publicUser(user),
      },
    };
  }
  async login(email: string, password: string) {
    const candidate = await this.db.user.findUnique({ where: { email } });
    if (
      !(await checkPassword(password, candidate?.passwordHash)) ||
      !candidate ||
      candidate.status !== "ACTIVE"
    )
      throw unauthorised();
    const result = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, candidate.id);
      const user = await tx.user.findUnique({ where: { id: candidate.id } });
      if (
        !user ||
        user.status !== "ACTIVE" ||
        user.passwordHash !== candidate.passwordHash ||
        user.roleId !== candidate.roleId
      )
        return null;
      const now = Date.now();
      const limits = this.limits(user.roleId);
      const family = await tx.authSession.create({
        data: {
          userId: user.id,
          roleAtAuthentication: user.roleId,
          idleExpiresAt: new Date(
            now + Math.min(limits.idle, limits.absolute) * 1000,
          ),
          absoluteExpiresAt: new Date(now + limits.absolute * 1000),
        },
      });
      return this.credentials(tx, user, family);
    });
    if (!result) throw unauthorised();
    return result;
  }
  private async revoke(tx: Tx, familyId: string, reason: string) {
    await tx.authSession.updateMany({
      where: { id: familyId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
    await tx.accessGrant.deleteMany({ where: { familyId } });
  }
  async refreshFamily(raw: unknown) {
    if (!validRefresh(raw)) return null;
    return (
      (
        await this.db.refreshToken.findUnique({
          where: { tokenHash: tokenHash(raw) },
          select: { familyId: true },
        })
      )?.familyId ?? null
    );
  }
  async refresh(raw: unknown) {
    if (!validRefresh(raw)) throw unauthorised();
    const hash = tokenHash(raw);
    const known = await this.db.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { family: true },
    });
    if (!known) throw unauthorised();
    const result = await this.db.$transaction(async (tx) => {
      // Every family mutation locks the user before the family (also used by future suspension).
      await this.lockUser(tx, known.family.userId);
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${known.familyId}::uuid FOR UPDATE`;
      const token = await tx.refreshToken.findUnique({
        where: { tokenHash: hash },
        include: { family: { include: { user: true } } },
      });
      if (!token) return null;
      const family = token.family;
      if (token.consumedAt) {
        await this.revoke(tx, family.id, "refresh_reuse");
        return null;
      }
      const now = new Date();
      if (
        family.revokedAt ||
        family.user.status !== "ACTIVE" ||
        family.roleAtAuthentication !== family.user.roleId ||
        family.idleExpiresAt <= now ||
        family.absoluteExpiresAt <= now ||
        token.expiresAt <= now
      ) {
        await this.revoke(tx, family.id, "ineligible_or_expired");
        return null;
      }
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      });
      const updated = await tx.authSession.update({
        where: { id: family.id },
        data: {
          lastRefreshedAt: now,
          idleExpiresAt: new Date(
            Math.min(
              now.getTime() + this.limits(family.user.roleId).idle * 1000,
              family.absoluteExpiresAt.getTime(),
            ),
          ),
        },
      });
      return this.credentials(tx, family.user, updated, token.id);
    });
    // Reuse revocation must COMMIT before returning 401.
    if (!result) throw unauthorised();
    return result;
  }
  async logout(raw: unknown) {
    if (!validRefresh(raw)) return;
    const token = await this.db.refreshToken.findUnique({
      where: { tokenHash: tokenHash(raw) },
      include: { family: true },
    });
    if (!token) return;
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, token.family.userId);
      await this.revoke(tx, token.familyId, "logout");
    });
  }
  async revokeAll(userId: number) {
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await revokeUserSessions(tx, userId, "logout_all");
    });
  }
  async authenticate(header: string | undefined) {
    const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
    if (!match) throw unauthorised();
    const claims = await this.tokens.verify(match[1]);
    const grant = await this.db.accessGrant.findUnique({
      where: { jti: claims.jti },
      include: { family: { include: { user: true } } },
    });
    const now = new Date();
    if (
      !grant ||
      grant.expiresAt <= now ||
      grant.family.userId !== claims.id ||
      grant.family.revokedAt ||
      grant.family.absoluteExpiresAt <= now ||
      grant.family.idleExpiresAt <= now
    )
      throw unauthorised();
    if (
      grant.family.user.status !== "ACTIVE" ||
      grant.family.user.roleId !== claims.role
    ) {
      await this.revokeAll(claims.id);
      throw unauthorised();
    }
    return {
      user: publicUser(grant.family.user),
      jti: claims.jti,
      familyId: grant.family.id,
    };
  }
}
