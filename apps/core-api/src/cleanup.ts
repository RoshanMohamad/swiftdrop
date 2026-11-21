import { createDatabase } from "@swiftdrop/db";
import { loadConfig } from "./shared/config.js";
import { cleanupAuth } from "./modules/auth/index.js";
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
try {
  const removed = await cleanupAuth(db, new Date(), {
    auditRetentionDays: config.AUDIT_RETENTION_DAYS,
  });
  console.log(
    `Removed up to ${removed.grants} expired grants, ${removed.families} expired families, ${removed.verificationTokens} expired verification tokens, ${removed.resetTokens} expired reset tokens, ${removed.mfaChallenges} expired MFA challenges, ${removed.oauthTransactions} expired OAuth transactions and ${removed.auditEvents} audit events past retention. Run in bounded scheduled batches.`,
  );
} finally {
  await db.$disconnect();
}
