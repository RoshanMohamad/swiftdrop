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
import { recordAudit, tryRecordAudit } from "./audit.js";
import type { MfaService } from "./mfa.js";
import { MFA_CHALLENGE_SECONDS } from "@swiftdrop/contracts";
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
      | "RECENT_AUTH_SECONDS"
      | "MFA_REQUIRED_ROLES"
    >,
    private mailer?: AuthMailer,
    private google = new GoogleOidc(config),
    private logger?: Pick<Logger, "warn">,
    readonly mfa?: MfaService,
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
  /** A new session family with its first credentials; the caller holds the user lock. */
  private async startSession(
    tx: Tx,
    user: User,
    assurance: { mfaVerifiedAt?: Date } = {},
  ) {
    const now = Date.now();
    const limits = this.limits(user.roleId);
    const family = await tx.authSession.create({
      data: {
        userId: user.id,
        roleAtAuthentication: user.roleId,
        ...(assurance.mfaVerifiedAt
          ? { mfaVerifiedAt: assurance.mfaVerifiedAt }
          : {}),
        idleExpiresAt: new Date(
          now + Math.min(limits.idle, limits.absolute) * 1000,
        ),
        absoluteExpiresAt: new Date(now + limits.absolute * 1000),
      },
    });
    return this.credentials(tx, user, family);
  }
  /**
   * Password step of sign-in. An account with a confirmed second factor gets an opaque
   * five-minute challenge and no session, cookie or token; everyone else gets a session.
   */
  async beginLogin(
    email: string,
    password: string,
  ): Promise<Credentials | { challengeToken: string }> {
    const candidate = await this.db.user.findUnique({ where: { email } });
    if (
      !(await checkPassword(password, candidate?.passwordHash)) ||
      !candidate ||
      candidate.status !== "ACTIVE"
    ) {
      await tryRecordAudit(
        this.db,
        {
          type: "LOGIN",
          outcome: "FAILURE",
          targetId: candidate?.id ?? null,
          metadata: { method: "password", reason: "credentials" },
        },
        () => this.logger?.warn({ event: "audit_write_failed" }),
      );
      throw unauthorised();
    }
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
      if (this.mfa && (await this.mfa.hasFactor(user.id, tx))) {
        const challengeToken = randomBytes(32).toString("base64url");
        // One open challenge per account: a new password step replaces the previous one.
        await tx.mfaChallenge.deleteMany({
          where: { userId: user.id, consumedAt: null },
        });
        await tx.mfaChallenge.create({
          data: {
            userId: user.id,
            tokenHash: tokenHash(challengeToken),
            expiresAt: new Date(Date.now() + MFA_CHALLENGE_SECONDS * 1000),
          },
        });
        return { challengeToken };
      }
      const credentials = await this.startSession(tx, user);
      await recordAudit(tx, {
        type: "LOGIN",
        outcome: "SUCCESS",
        actorId: user.id,
        targetId: user.id,
        metadata: { method: "password" },
      });
      return credentials;
    });
    if (!result) throw unauthorised();
    return result;
  }
  /** Sign-in for callers that cannot handle a challenge (tests, tooling). */
  async login(email: string, password: string) {
    const result = await this.beginLogin(email, password);
    if ("challengeToken" in result)
      throw new HttpError(
        409,
        "MFA_REQUIRED",
        "This account requires its second factor to sign in.",
      );
    return result;
  }

  /** Second step: a 6 digit code (or, below, a recovery code) turns a challenge into a session. */
  verifyMfaChallenge(challengeToken: string, code: string) {
    return this.completeChallenge(challengeToken, "totp", (tx, userId) =>
      this.mfa!.verifyCode(userId, code, tx),
    );
  }
  recoverMfaChallenge(challengeToken: string, recoveryCode: string) {
    return this.completeChallenge(challengeToken, "recovery", (tx, userId) =>
      this.mfa!.consumeRecoveryCode(userId, recoveryCode, tx),
    );
  }
  private async completeChallenge(
    rawToken: string,
    method: "totp" | "recovery",
    proof: (tx: Tx, userId: number) => Promise<boolean>,
  ) {
    const invalid = () =>
      new HttpError(
        401,
        "MFA_CHALLENGE_INVALID",
        "The code is incorrect or the sign-in expired. Sign in again.",
      );
    if (!this.mfa) throw invalid();
    const hash = tokenHash(rawToken);
    const known = await this.db.mfaChallenge.findUnique({
      where: { tokenHash: hash },
    });
    if (!known) throw invalid();
    const MAX_ATTEMPTS = 5;
    const outcome = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, known.userId);
      const challenge = await tx.mfaChallenge.findUnique({
        where: { tokenHash: hash },
      });
      const user = await tx.user.findUnique({ where: { id: known.userId } });
      const now = new Date();
      if (
        !challenge ||
        !user ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attempts >= MAX_ATTEMPTS ||
        user.status !== "ACTIVE"
      )
        return "invalid" as const;
      if (!(await proof(tx, user.id))) {
        // The failed attempt is counted and committed; the error is thrown after the commit.
        await tx.mfaChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        await recordAudit(tx, {
          type: "MFA_CHALLENGE",
          outcome: "FAILURE",
          targetId: user.id,
          metadata: { method },
        });
        return "wrong" as const;
      }
      await tx.mfaChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      const credentials = await this.startSession(tx, user, {
        mfaVerifiedAt: now,
      });
      await recordAudit(tx, {
        type: "LOGIN",
        outcome: "SUCCESS",
        actorId: user.id,
        targetId: user.id,
        metadata: { method },
      });
      if (method === "recovery")
        await recordAudit(tx, {
          type: "MFA_RECOVERY_CODE_USED",
          outcome: "SUCCESS",
          actorId: user.id,
          targetId: user.id,
          metadata: {
            remaining: await tx.mfaRecoveryCode.count({
              where: { userId: user.id, usedAt: null },
            }),
          },
        });
      return credentials;
    });
    if (outcome === "invalid" || outcome === "wrong") throw invalid();
    return outcome;
  }

  /**
   * Fresh proof for a sensitive action: the current password and, when a second factor is
   * enabled, a current code. The proof is recorded on the session family on the server; refresh
   * never touches it, so a stolen refresh cookie cannot pass for recent proof.
   */
  async reauthenticate(
    userId: number,
    familyId: string,
    password: string,
    code?: string,
  ) {
    const failed = new HttpError(
      400,
      "REAUTH_FAILED",
      "The password or code is incorrect.",
    );
    const user = await this.db.user.findUnique({ where: { id: userId } });
    const passwordOk =
      (await checkPassword(password, user?.passwordHash)) &&
      user?.status === "ACTIVE";
    const hasFactor = Boolean(this.mfa && (await this.mfa.hasFactor(userId)));
    if (passwordOk && hasFactor && !code)
      throw new HttpError(
        400,
        "MFA_CODE_REQUIRED",
        "Enter the 6 digit code from your authenticator app.",
      );
    const codeOk =
      !hasFactor || (passwordOk && (await this.mfa!.verifyCode(userId, code!)));
    if (!passwordOk || !codeOk) {
      await tryRecordAudit(
        this.db,
        {
          type: "REAUTHENTICATE",
          outcome: "FAILURE",
          actorId: userId,
          targetId: userId,
          metadata: { reason: passwordOk ? "code" : "password" },
        },
        () => this.logger?.warn({ event: "audit_write_failed" }),
      );
      throw failed;
    }
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const updated = await tx.authSession.updateMany({
        where: { id: familyId, userId, revokedAt: null },
        data: {
          reauthenticatedAt: now,
          ...(hasFactor ? { mfaVerifiedAt: now } : {}),
        },
      });
      if (updated.count !== 1) throw unauthorised();
      await recordAudit(tx, {
        type: "REAUTHENTICATE",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
    });
    return now;
  }

  /** Marks the current session as having just proved its second factor (after enrolment). */
  async markMfaVerified(familyId: string) {
    const now = new Date();
    await this.db.authSession.updateMany({
      where: { id: familyId, revokedAt: null },
      data: { mfaVerifiedAt: now },
    });
  }

  /**
   * Throws 403 REAUTH_REQUIRED unless this session proved its password within
   * RECENT_AUTH_SECONDS and, with `mfa` and an enabled factor, its code as well.
   */
  async assertRecentAuth(
    userId: number,
    familyId: string,
    options: { mfa?: boolean } = {},
  ) {
    const session = await this.db.authSession.findUnique({
      where: { id: familyId },
    });
    if (!session || session.userId !== userId || session.revokedAt)
      throw unauthorised();
    const windowMs = this.config.RECENT_AUTH_SECONDS * 1000;
    const now = Date.now();
    const proved = Math.max(
      session.authenticatedAt.getTime(),
      session.reauthenticatedAt?.getTime() ?? 0,
    );
    let recent = now - proved <= windowMs;
    if (recent && options.mfa && this.mfa && (await this.mfa.hasFactor(userId)))
      recent =
        session.mfaVerifiedAt !== null &&
        now - session.mfaVerifiedAt.getTime() <= windowMs;
    if (!recent)
      throw new HttpError(
        403,
        "REAUTH_REQUIRED",
        "Confirm your password to continue.",
      );
  }

  /** True when the role must have a second factor and this account has none yet. */
  async mfaEnrolmentRequired(userId: number, role: Role) {
    return Boolean(
      this.mfa &&
        this.config.MFA_REQUIRED_ROLES.includes(role) &&
        !(await this.mfa.hasFactor(userId)),
    );
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
        await recordAudit(tx, {
          type: "REFRESH_REUSE",
          outcome: "FAILURE",
          targetId: family.userId,
          metadata: { reason: "consumed_token_presented" },
        });
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
      await recordAudit(tx, {
        type: "LOGOUT",
        outcome: "SUCCESS",
        actorId: token.family.userId,
        targetId: token.family.userId,
      });
    });
  }
  async revokeAll(userId: number) {
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await revokeUserSessions(tx, userId, "logout_all");
      await recordAudit(tx, {
        type: "LOGOUT_ALL",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
    });
  }
  // ---- Password recovery and session management (auth plan 4.3, 4.5, section 7) ----

  /**
   * Always accepted, never reveals whether the address exists. Only an active account with a
   * local password gets a reset link; suspended, invited, passwordless and unknown addresses
   * get nothing. Mail is sent after the token commits and is not awaited, so response time does
   * not depend on whether an address is registered.
   */
  async requestPasswordReset(email: string) {
    if (!this.mailer?.sendPasswordReset) return;
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || user.status !== "ACTIVE") return;
    // No local password to reset (Google sign-in only): same silence as an unknown address.
    if (!user.passwordHash) return;
    const raw = randomBytes(32).toString("base64url");
    const issued = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (current.status !== "ACTIVE" || !current.passwordHash) return false;
      const latest = await tx.passwordResetToken.findFirst({
        where: { userId: user.id },
        orderBy: { generation: "desc" },
      });
      // One link per minute per account: a burst cannot flood a mailbox.
      if (latest && Date.now() - latest.createdAt.getTime() < 60_000)
        return false;
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(raw),
          generation: (latest?.generation ?? 0) + 1,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      await recordAudit(tx, {
        type: "PASSWORD_RESET_REQUESTED",
        outcome: "SUCCESS",
        targetId: user.id,
      });
      return true;
    });
    if (!issued) return;
    this.deliver(
      this.mailer.sendPasswordReset(
        user.email,
        `${this.config.APP_ORIGIN}/auth/reset-password#token=${raw}`,
      ),
    );
  }
  private deliver(sending: Promise<unknown>) {
    // The account and its hashed token stay valid; the generic request can be repeated.
    sending.catch(() => this.logger?.warn({ event: "password_mail_failed" }));
  }

  /**
   * Consumes a reset token exactly once, sets the new password and signs the account out
   * everywhere. It never logs the user in, unsuspends, changes the role or touches a Google
   * link. A token that is unknown, expired, used or replaced is one indistinguishable error.
   */
  async resetPassword(raw: string, password: string) {
    const invalid = () =>
      new HttpError(
        400,
        "INVALID_RESET",
        "This password reset link is invalid or expired.",
      );
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw invalid();
    const hash = tokenHash(raw);
    const known = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: hash },
      select: { userId: true },
    });
    if (!known) throw invalid();
    const passwordHash = await hashPassword(password);
    const done = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, known.userId);
      const user = await tx.user.findUnique({ where: { id: known.userId } });
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hash },
      });
      const now = new Date();
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !user.passwordHash ||
        !token ||
        token.consumedAt ||
        token.revokedAt ||
        token.expiresAt <= now
      )
        return false;
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await revokeUserSessions(tx, user.id, "password_reset", now);
      await recordAudit(tx, {
        type: "PASSWORD_RESET",
        outcome: "SUCCESS",
        targetId: user.id,
      });
      return true;
    });
    if (!done) throw invalid();
  }

  /**
   * Fresh proof of the current password, then a new one. Every session, including the caller's,
   * is revoked and replaced by one new session, so a stolen older session cannot survive.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const candidate = await this.db.user.findUnique({ where: { id: userId } });
    if (
      !(await checkPassword(currentPassword, candidate?.passwordHash)) ||
      !candidate ||
      candidate.status !== "ACTIVE"
    ) {
      await tryRecordAudit(
        this.db,
        {
          type: "PASSWORD_CHANGE",
          outcome: "FAILURE",
          actorId: userId,
          targetId: userId,
          metadata: { reason: "current_password" },
        },
        () => this.logger?.warn({ event: "audit_write_failed" }),
      );
      throw new HttpError(
        400,
        "CURRENT_PASSWORD_INCORRECT",
        "The current password is incorrect.",
      );
    }
    if (currentPassword === newPassword)
      throw new HttpError(
        400,
        "PASSWORD_UNCHANGED",
        "Choose a password different from the current one.",
      );
    const passwordHash = await hashPassword(newPassword);
    const result = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !user ||
        user.status !== "ACTIVE" ||
        user.passwordHash !== candidate.passwordHash
      )
        return null;
      const now = new Date();
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      // A pending reset link must not outlive a deliberate change.
      await tx.passwordResetToken.updateMany({
        where: { userId, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await revokeUserSessions(tx, userId, "password_change", now);
      await recordAudit(tx, {
        type: "PASSWORD_CHANGE",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
      return this.startSession(tx, updated);
    });
    if (!result)
      throw new HttpError(
        409,
        "ACCOUNT_CHANGED",
        "Your account changed while saving. Sign in again and retry.",
      );
    return result;
  }

  /**
   * The caller's own live sessions, most recently active first, as a cursor page: ids and times
   * only, never tokens or network details. The cursor encodes (last activity, id), the same
   * keys as the ordering, so a page is stable while sessions come and go.
   */
  async listSessions(
    userId: number,
    currentFamilyId: string,
    page: { cursor?: string | undefined; limit?: number } = {},
  ) {
    const now = new Date();
    const limit = Math.min(Math.max(page.limit ?? 20, 1), 50);
    let after: { at: Date; id: string } | undefined;
    if (page.cursor) {
      const [time, id] = Buffer.from(page.cursor, "base64url")
        .toString("utf8")
        .split("|");
      const at = new Date(time ?? "");
      if (Number.isNaN(at.getTime()) || !id || !/^[0-9a-f-]{36}$/i.test(id))
        throw new HttpError(400, "CURSOR", "The page cursor is invalid.");
      after = { at, id };
    }
    const rows = await this.db.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        ...(after
          ? {
              OR: [
                { lastRefreshedAt: { lt: after.at } },
                { lastRefreshedAt: after.at, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastRefreshedAt: "desc" }, { id: "asc" }],
      take: limit + 1,
    });
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              `${last.lastRefreshedAt.toISOString()}|${last.id}`,
            ).toString("base64url")
          : null,
      items: visible.map((row) => ({
        id: row.id,
        authenticatedAt: row.authenticatedAt.toISOString(),
        lastRefreshedAt: row.lastRefreshedAt.toISOString(),
        idleExpiresAt: row.idleExpiresAt.toISOString(),
        absoluteExpiresAt: row.absoluteExpiresAt.toISOString(),
        current: row.id === currentFamilyId,
      })),
    };
  }

  /** Own sessions only: another account's or an unknown id is a 404. Already revoked is fine. */
  async revokeSession(userId: number, id: string) {
    const notFound = () =>
      new HttpError(404, "SESSION_NOT_FOUND", "Session not found.");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const changed = await tx.authSession.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: "session_revoked" },
      });
      if (changed.count === 1) {
        await tx.accessGrant.deleteMany({ where: { familyId: id } });
        await recordAudit(tx, {
          type: "SESSION_REVOKED",
          outcome: "SUCCESS",
          actorId: userId,
          targetId: userId,
        });
      } else if (
        !(await tx.authSession.findFirst({
          where: { id, userId },
          select: { id: true },
        }))
      )
        throw notFound();
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
      !grant.familyId ||
      !grant.family ||
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
