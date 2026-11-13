import type { ParcelStatus } from "@swiftdrop/contracts";

export type AnyStatus =
  | ParcelStatus
  | "ACTIVE"
  | "INVITED"
  | "PENDING"
  | "SUSPENDED"
  | "APPROVED"
  | "REJECTED";

export interface StatusBadgeProps {
  status: AnyStatus;
  label?: string;
  className?: string;
}

const STATUS_CLASS_MAP: Record<string, string> = {
  CREATED: "status-created",
  PICKED_UP: "status-picked-up",
  IN_TRANSIT: "status-in-transit",
  OUT_FOR_DELIVERY: "status-out-for-delivery",
  DELIVERED: "status-delivered",
  FAILED: "status-failed",
  CANCELLED: "status-cancelled",
  ACTIVE: "status-delivered",
  APPROVED: "status-delivered",
  PENDING: "status-created",
  INVITED: "status-created",
  SUSPENDED: "status-failed",
  REJECTED: "status-failed",
};

const DEFAULT_LABELS: Record<string, string> = {
  CREATED: "Created",
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery Failed",
  CANCELLED: "Cancelled",
  ACTIVE: "Active",
  APPROVED: "Approved",
  PENDING: "Pending",
  INVITED: "Invited",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
};

/**
 * Accessible status badge for parcels, orders, and user account states.
 */
export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const statusClass = STATUS_CLASS_MAP[status] ?? "status-created";
  const displayLabel = label ?? DEFAULT_LABELS[status] ?? status;

  return (
    <span
      className={`status-badge ${statusClass} ${className}`.trim()}
      aria-label={`Status: ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
}

