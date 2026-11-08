CREATE TABLE "service_principals" (
    "service_id" VARCHAR(80) NOT NULL,
    "service_kind" VARCHAR(32) NOT NULL,
    "audience" VARCHAR(120) NOT NULL,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "service_principals_pkey" PRIMARY KEY ("service_id")
);

CREATE TABLE "service_public_keys" (
    "key_id" VARCHAR(80) NOT NULL,
    "service_id" VARCHAR(80) NOT NULL,
    "public_key_pem" TEXT NOT NULL,
    "not_before" TIMESTAMPTZ(3) NOT NULL,
    "not_after" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_public_keys_pkey" PRIMARY KEY ("key_id"),
    CONSTRAINT "service_public_keys_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_principals"("service_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "service_public_keys_service_id_not_before_not_after_idx" ON "service_public_keys"("service_id", "not_before", "not_after");
