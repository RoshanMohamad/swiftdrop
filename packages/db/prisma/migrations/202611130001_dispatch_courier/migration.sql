CREATE TABLE "courier_profiles" (
    "user_id" INTEGER NOT NULL,
    "on_duty" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "workload" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courier_profiles_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "courier_profiles_capacity_check" CHECK ("capacity" BETWEEN 1 AND 100),
    CONSTRAINT "courier_profiles_workload_check" CHECK ("workload" >= 0)
);

CREATE TABLE "parcel_assignments" (
    "parcel_id" UUID NOT NULL,
    "courier_id" INTEGER NOT NULL,
    "assigned_by_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    "release_reason" VARCHAR(24),

    CONSTRAINT "parcel_assignments_pkey" PRIMARY KEY ("parcel_id")
);

CREATE TABLE "courier_operations" (
    "id" UUID NOT NULL,
    "courier_id" INTEGER NOT NULL,
    "operation_key" VARCHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "parcel_id" UUID NOT NULL,
    "to_status" "ParcelStatus" NOT NULL,
    "received_by" VARCHAR(120),
    "failure_reason" VARCHAR(32),
    "proof_object_key" VARCHAR(255),
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_operations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parcel_assignments_courier_id_released_at_idx" ON "parcel_assignments"("courier_id", "released_at");
CREATE UNIQUE INDEX "courier_operations_courier_id_operation_key_key" ON "courier_operations"("courier_id", "operation_key");
CREATE INDEX "courier_operations_parcel_id_created_at_idx" ON "courier_operations"("parcel_id", "created_at");

ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcel_assignments" ADD CONSTRAINT "parcel_assignments_parcel_id_fkey"
  FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcel_assignments" ADD CONSTRAINT "parcel_assignments_courier_id_fkey"
  FOREIGN KEY ("courier_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_operations" ADD CONSTRAINT "courier_operations_courier_id_fkey"
  FOREIGN KEY ("courier_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_operations" ADD CONSTRAINT "courier_operations_parcel_id_fkey"
  FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
