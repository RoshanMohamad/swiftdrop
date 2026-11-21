-- Recent-authentication, MFA (TOTP) and the security audit trail (auth plan 4.7, 6).

-- Server-recorded assurance on the session family: when the user last proved the password and,
-- for accounts with a second factor, the code. Refresh never touches these, so it cannot count
-- as recent proof.
ALTER TABLE "auth_sessions" ADD COLUMN "reauthenticated_at" TIMESTAMPTZ(3);
ALTER TABLE "auth_sessions" ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(3);

-- User ids are deliberately not foreign keys: the trail outlives the account.
CREATE TABLE "auth_audit_events" (
  "id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "event_type" VARCHAR(40) NOT NULL,
  "outcome" VARCHAR(8) NOT NULL,
  "actor_user_id" INTEGER,
  "target_user_id" INTEGER,
  "correlation_id" VARCHAR(64),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "auth_audit_events_outcome" CHECK ("outcome" IN ('SUCCESS', 'FAILURE')),
  PRIMARY KEY ("id")
);
CREATE INDEX "auth_audit_events_occurred_at_idx" ON "auth_audit_events"("occurred_at");
CREATE INDEX "auth_audit_events_target_user_id_occurred_at_idx" ON "auth_audit_events"("target_user_id", "occurred_at");
CREATE INDEX "auth_audit_events_event_type_occurred_at_idx" ON "auth_audit_events"("event_type", "occurred_at");

CREATE TABLE "mfa_factors" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "encrypted_secret" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3),
  "last_used_step" BIGINT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_factors_user_id_key" ON "mfa_factors"("user_id");

CREATE TABLE "mfa_recovery_codes" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "code_hash" CHAR(64) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

CREATE TABLE "mfa_challenges" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "mfa_challenges"("token_hash");
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges"("user_id");
