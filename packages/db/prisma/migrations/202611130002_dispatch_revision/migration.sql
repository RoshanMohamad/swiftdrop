ALTER TABLE "parcels"
ADD COLUMN "dispatch_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "parcels"
ADD CONSTRAINT "parcels_dispatch_version_check"
CHECK ("dispatch_version" > 0);
