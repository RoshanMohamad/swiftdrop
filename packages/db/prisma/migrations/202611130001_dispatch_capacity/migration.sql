CREATE TYPE "CourierAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED');

CREATE TABLE "courier_profiles" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "on_duty" BOOLEAN NOT NULL DEFAULT false,
    "max_capacity" INTEGER NOT NULL,
    "current_workload" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "courier_profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "courier_profiles"
ADD CONSTRAINT "courier_profiles_capacity_check"
CHECK ("max_capacity" > 0 AND "current_workload" >= 0 AND "current_workload" <= "max_capacity");

CREATE TABLE "courier_assignments" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "courier_profile_id" UUID NOT NULL,
    "status" "CourierAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "courier_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courier_profiles_user_id_key"
ON "courier_profiles"("user_id");

CREATE UNIQUE INDEX "courier_assignments_active_parcel_key"
ON "courier_assignments"("parcel_id")
WHERE "status" = 'ACTIVE';

CREATE INDEX "courier_assignments_courier_profile_id_status_assigned_at_idx"
ON "courier_assignments"("courier_profile_id", "status", "assigned_at");

CREATE INDEX "courier_assignments_parcel_id_status_assigned_at_idx"
ON "courier_assignments"("parcel_id", "status", "assigned_at");

ALTER TABLE "courier_profiles"
ADD CONSTRAINT "courier_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "courier_assignments"
ADD CONSTRAINT "courier_assignments_parcel_id_fkey"
FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "courier_assignments"
ADD CONSTRAINT "courier_assignments_courier_profile_id_fkey"
FOREIGN KEY ("courier_profile_id") REFERENCES "courier_profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
