-- Password recovery (auth plan 4.5): purpose-bound, single-use, hashed, short-lived tokens.
-- Same shape and constraints as verification_tokens; a reset token can never verify an email.
CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" CHAR(64) NOT NULL,
  "generation" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_generation_positive" CHECK ("generation" > 0),
  CONSTRAINT "password_reset_expiry" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "password_reset_single_use" CHECK (NOT ("consumed_at" IS NOT NULL AND "revoked_at" IS NOT NULL)),
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_generation_idx" ON "password_reset_tokens"("user_id", "generation");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
