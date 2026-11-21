import type { Database } from "@swiftdrop/db";
import { cleanupAudit } from "./audit.js";
export async function cleanupAuth(
  db: Database,
  now = new Date(),
  options: { auditRetentionDays?: number } = {},
) {
  const grants = await db.accessGrant.findMany({
    where: { expiresAt: { lte: now } },
    select: { jti: true },
    take: 500,
  });
  const families = await db.authSession.findMany({
    where: { absoluteExpiresAt: { lte: now } },
    select: { id: true },
    take: 100,
  });
  const verificationTokens = await db.verificationToken.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  const oauthTransactions = await db.oAuthTransaction.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  const staffInvitations = await db.staffInvitation.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  const resetTokens = await db.passwordResetToken.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  const mfaChallenges = await db.mfaChallenge.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  await db.$transaction(async (tx) => {
    await tx.accessGrant.deleteMany({
      where: { jti: { in: grants.map((grant) => grant.jti) } },
    });
    const familyIds = families.map((family) => family.id);
    await tx.refreshToken.deleteMany({
      where: { familyId: { in: familyIds } },
    });
    await tx.authSession.deleteMany({ where: { id: { in: familyIds } } });
    await tx.verificationToken.deleteMany({
      where: { id: { in: verificationTokens.map(({ id }) => id) } },
    });
    await tx.oAuthTransaction.deleteMany({
      where: { id: { in: oauthTransactions.map(({ id }) => id) } },
    });
    await tx.staffInvitation.deleteMany({
      where: { id: { in: staffInvitations.map(({ id }) => id) } },
    });
    await tx.passwordResetToken.deleteMany({
      where: { id: { in: resetTokens.map(({ id }) => id) } },
    });
    await tx.mfaChallenge.deleteMany({
      where: { id: { in: mfaChallenges.map(({ id }) => id) } },
    });
  });
  const auditEvents = await cleanupAudit(
    db,
    options.auditRetentionDays ?? 365,
    now,
  );
  return {
    grants: grants.length,
    families: families.length,
    verificationTokens: verificationTokens.length,
    oauthTransactions: oauthTransactions.length,
    staffInvitations: staffInvitations.length,
    resetTokens: resetTokens.length,
    mfaChallenges: mfaChallenges.length,
    auditEvents,
  };
}
