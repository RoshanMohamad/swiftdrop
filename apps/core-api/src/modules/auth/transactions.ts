import type { Prisma } from "@swiftdrop/db";

export async function revokeUserSessions(
  tx: Prisma.TransactionClient,
  userId: number,
  reason: string,
  now = new Date(),
) {
  // The caller holds the user lock before touching families/grants.
  await tx.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revocationReason: reason },
  });
  await tx.accessGrant.deleteMany({ where: { family: { userId } } });
}
