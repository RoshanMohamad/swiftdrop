-- AlterEnum: add all lifecycle statuses (FR-P4, M05)
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL
ALTER TYPE "ParcelStatus" ADD VALUE 'PICKED_UP';
ALTER TYPE "ParcelStatus" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "ParcelStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "ParcelStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "ParcelStatus" ADD VALUE 'FAILED';
ALTER TYPE "ParcelStatus" ADD VALUE 'CANCELLED';
