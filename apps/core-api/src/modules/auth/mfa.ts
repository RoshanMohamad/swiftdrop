import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
} from "node:crypto";
import { Prisma, type Database } from "@swiftdrop/db";
import { HttpError } from "../../shared/problem.js";
import { recordAudit } from "./audit.js";
import { newTotpSecret, otpauthUri, totpStep, verifyTotp } from "./totp.js";

type Tx = Prisma.TransactionClient;
const ISSUER = "SwiftDrop";
export const RECOVERY_CODE_COUNT = 10;
// Same unambiguous alphabet as tracking numbers: nothing to misread when typed from paper.
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export type MfaConfig = {
  mfaSecret: string;
  MFA_KEY_VERSION: number;
  MFA_REQUIRED_ROLES: string[];
};

/**
 * Second factor (TOTP) and its recovery codes (auth plan 4.7).
 *
 * - The TOTP secret is encrypted at rest with AES-256-GCM under a key derived from the dedicated
 *   MFA secret; the key version is stored with it so the key can be rotated.
 * - A factor works only after the user proves they can generate a code (confirm); until then it
 *   is pending and never required at sign-in.
 * - An accepted code can never be used twice: the newest accepted 30 second step is stored and
 *   advanced atomically, so two simultaneous submissions of one code yield one success.
 * - Recovery codes are shown once, stored only as keyed hashes, and each works once.
 */
export class MfaService {
  constructor(
    private db: Database,
    private config: MfaConfig,
  ) {}

  private key(version: number) {
    return Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(this.config.mfaSecret, "utf8"),
        Buffer.from("swiftdrop-mfa-v1"),
        Buffer.from(`totp-secret:v${version}`),
        32,
      ),
    );
  }
  encryptSecret(secret: string) {
    const version = this.config.MFA_KEY_VERSION;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(version), iv);
    cipher.setAAD(Buffer.from("mfa-totp-secret"));
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      keyVersion: version,
      encryptedSecret: [iv, cipher.getAuthTag(), encrypted]
        .map((part) => part.toString("base64url"))
        .join("."),
    };
  }
  decryptSecret(stored: string, keyVersion: number) {
    const [iv, tag, data] = stored
      .split(".")
      .map((part) => Buffer.from(part, "base64url"));
    if (!iv || !tag || !data || iv.length !== 12 || tag.length !== 16)
      throw new Error("Stored MFA secret is invalid.");
    const decipher = createDecipheriv("aes-256-gcm", this.key(keyVersion), iv);
    decipher.setAAD(Buffer.from("mfa-totp-secret"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
  /** Recovery codes are low-entropy compared with a secret key, so hash them with a server key. */
  private codeHash(code: string) {
    const normalised = code.replace(/[\s-]/g, "").toUpperCase();
    return createHmac(
      "sha256",
      Buffer.from(
        hkdfSync(
          "sha256",
          Buffer.from(this.config.mfaSecret, "utf8"),
          Buffer.from("swiftdrop-mfa-v1"),
          Buffer.from("recovery-code-hash"),
          32,
        ),
      ),
    )
      .update(normalised)
      .digest("hex");
  }
  roleRequiresMfa(role: string) {
    return this.config.MFA_REQUIRED_ROLES.includes(role);
  }

  async hasFactor(userId: number, client: Pick<Database, "mfaFactor"> | Tx = this.db) {
    return Boolean(
      await client.mfaFactor.findFirst({
        where: { userId, confirmedAt: { not: null } },
        select: { id: true },
      }),
    );
  }

  async status(userId: number, role: string) {
    const factor = await this.db.mfaFactor.findUnique({ where: { userId } });
    return {
      enabled: Boolean(factor?.confirmedAt),
      pendingEnrolment: Boolean(factor && !factor.confirmedAt),
      recoveryCodesRemaining: factor?.confirmedAt
        ? await this.db.mfaRecoveryCode.count({ where: { userId, usedAt: null } })
        : 0,
      required: this.roleRequiresMfa(role),
    };
  }

  /** Starts (or restarts) enrolment: a fresh secret, pending until a code proves it works. */
  async enrol(userId: number, email: string) {
    const secret = newTotpSecret();
    const sealed = this.encryptSecret(secret);
    await this.db.$transaction(async (tx) => {
      const existing = await tx.mfaFactor.findUnique({ where: { userId } });
      if (existing?.confirmedAt)
        throw new HttpError(
          409,
          "MFA_ALREADY_ENABLED",
          "A second factor is already enabled. Disable it before enrolling a new one.",
        );
      await tx.mfaFactor.upsert({
        where: { userId },
        create: { userId, ...sealed },
        update: { ...sealed, lastUsedStep: null },
      });
      await recordAudit(tx, {
        type: "MFA_ENROL_STARTED",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
    });
    return { secret, otpauthUri: otpauthUri(secret, email, ISSUER) };
  }

  /** Verifies a code against the confirmed factor and advances the replay guard atomically. */
  async verifyCode(userId: number, code: string, tx: Tx | Database = this.db) {
    const factor = await tx.mfaFactor.findFirst({
      where: { userId, confirmedAt: { not: null } },
    });
    if (!factor) return false;
    const result = verifyTotp(
      this.decryptSecret(factor.encryptedSecret, factor.keyVersion),
      code,
      Date.now(),
      {
        lastUsedStep:
          factor.lastUsedStep === null ? null : Number(factor.lastUsedStep),
      },
    );
    if (!result.ok) return false;
    // Conditional update: of two simultaneous submissions of one code, only one advances the step.
    const advanced = await tx.mfaFactor.updateMany({
      where: {
        id: factor.id,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(result.step) } }],
      },
      data: { lastUsedStep: BigInt(result.step) },
    });
    return advanced.count === 1;
  }

  /** Finishes enrolment. Returns the recovery codes, which are never shown again. */
  async confirm(userId: number, code: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const factor = await tx.mfaFactor.findUnique({ where: { userId } });
      if (!factor)
        throw new HttpError(409, "MFA_NOT_STARTED", "Start enrolment first.");
      if (factor.confirmedAt)
        throw new HttpError(409, "MFA_ALREADY_ENABLED", "A second factor is already enabled.");
      const result = verifyTotp(
        this.decryptSecret(factor.encryptedSecret, factor.keyVersion),
        code,
        Date.now(),
      );
      if (!result.ok) {
        await recordAudit(tx, {
          type: "MFA_ENABLED",
          outcome: "FAILURE",
          actorId: userId,
          targetId: userId,
        });
        return null;
      }
      await tx.mfaFactor.update({
        where: { id: factor.id },
        data: { confirmedAt: new Date(), lastUsedStep: BigInt(result.step) },
      });
      const codes = await this.issueRecoveryCodes(tx, userId);
      await recordAudit(tx, {
        type: "MFA_ENABLED",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
      return codes;
    }).then((codes) => {
      if (!codes)
        throw new HttpError(400, "MFA_CODE_INVALID", "That code is not correct. Check the app and try again.");
      return codes;
    });
  }

  private async issueRecoveryCodes(tx: Tx, userId: number) {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      let raw = "";
      for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    await tx.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: this.codeHash(code) })),
    });
    return codes;
  }

  /** Replaces all recovery codes (the old ones stop working). */
  async regenerateRecoveryCodes(userId: number) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!(await this.hasFactor(userId, tx)))
        throw new HttpError(409, "MFA_NOT_ENABLED", "Enable a second factor first.");
      const codes = await this.issueRecoveryCodes(tx, userId);
      await recordAudit(tx, {
        type: "MFA_RECOVERY_CODES_REGENERATED",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
      return codes;
    });
  }

  /** Spends one recovery code, atomically: of two simultaneous uses, one wins. */
  async consumeRecoveryCode(userId: number, code: string, tx: Tx | Database = this.db) {
    const used = await tx.mfaRecoveryCode.updateMany({
      where: { userId, codeHash: this.codeHash(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1;
  }

  async disable(userId: number, role: string) {
    if (this.roleRequiresMfa(role))
      throw new HttpError(
        403,
        "MFA_REQUIRED_FOR_ROLE",
        "Your role requires a second factor, so it cannot be turned off.",
      );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      const removed = await tx.mfaFactor.deleteMany({ where: { userId } });
      if (removed.count === 0)
        throw new HttpError(409, "MFA_NOT_ENABLED", "No second factor is enabled.");
      await recordAudit(tx, {
        type: "MFA_DISABLED",
        outcome: "SUCCESS",
        actorId: userId,
        targetId: userId,
      });
    });
  }

  /** Current 30 second step, exposed so tests and callers share one clock definition. */
  currentStep() {
    return totpStep(Date.now());
  }
}
