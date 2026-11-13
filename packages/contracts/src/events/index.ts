import { parcelStatuses, type ParcelStatus } from "../lifecycle";

export type { ParcelStatus } from "../lifecycle";

export interface EventEnvelope<TType extends string, TData extends object> {
  eventId: string;
  type: TType;
  version: number;
  occurredAt: string;
  sequence: number;
  data: TData;
}

export interface ParcelCreatedData {
  parcelId: string;
  trackingNo: string;
  customerId?: string;
  merchantId?: string;
  originZone: string;
  destZone: string;
  feeCents: number;
  scheduledDate: string;
}

export interface ParcelCreatedEvent extends EventEnvelope<
  "parcel.created",
  ParcelCreatedData
> {
  type: "parcel.created";
  version: 1;
  data: ParcelCreatedData;
}

export interface ParcelStatusChangedData {
  parcelId: string;
  trackingNo: string;
  merchantId?: string;
  courierId?: string;
  from: ParcelStatus;
  to: ParcelStatus;
  town?: string;
  occurredAt: string;
}

export interface ParcelStatusChangedEvent extends EventEnvelope<
  "parcel.status.changed",
  ParcelStatusChangedData
> {
  type: "parcel.status.changed";
  version: 1;
  data: ParcelStatusChangedData;
}

export interface ParcelAssignedData {
  parcelId: string;
  trackingNo: string;
  oldCourierId?: string;
  newCourierId?: string;
}

export interface ParcelAssignedEvent extends EventEnvelope<
  "parcel.assignment.changed",
  ParcelAssignedData
> {
  type: "parcel.assignment.changed";
  version: 1;
  data: ParcelAssignedData;
}

export type SwiftDropEvent =
  ParcelCreatedEvent | ParcelStatusChangedEvent | ParcelAssignedEvent;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const parcelStatusValues: ReadonlySet<string> = new Set(parcelStatuses);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function hasValidBaseEnvelope(
  raw: unknown,
): raw is Record<string, unknown> & { data: Record<string, unknown> } {
  if (!isRecord(raw) || !isRecord(raw.data)) return false;

  return (
    typeof raw.eventId === "string" &&
    UUID_PATTERN.test(raw.eventId) &&
    typeof raw.type === "string" &&
    raw.version === 1 &&
    isIsoDateTime(raw.occurredAt) &&
    typeof raw.sequence === "number" &&
    Number.isInteger(raw.sequence) &&
    raw.sequence > 0
  );
}

function isParcelCreatedData(
  data: Record<string, unknown>,
): data is Record<string, unknown> & ParcelCreatedData {
  return (
    isNonEmptyString(data.parcelId) &&
    isNonEmptyString(data.trackingNo) &&
    isOptionalString(data.customerId) &&
    isOptionalString(data.merchantId) &&
    isNonEmptyString(data.originZone) &&
    isNonEmptyString(data.destZone) &&
    typeof data.feeCents === "number" &&
    Number.isInteger(data.feeCents) &&
    data.feeCents >= 0 &&
    isNonEmptyString(data.scheduledDate)
  );
}

function isParcelStatusChangedData(
  data: Record<string, unknown>,
): data is Record<string, unknown> & ParcelStatusChangedData {
  return (
    isNonEmptyString(data.parcelId) &&
    isNonEmptyString(data.trackingNo) &&
    isOptionalString(data.merchantId) &&
    isOptionalString(data.courierId) &&
    typeof data.from === "string" &&
    parcelStatusValues.has(data.from) &&
    typeof data.to === "string" &&
    parcelStatusValues.has(data.to) &&
    isOptionalString(data.town) &&
    isIsoDateTime(data.occurredAt)
  );
}

function isParcelAssignedData(
  data: Record<string, unknown>,
): data is Record<string, unknown> & ParcelAssignedData {
  return (
    isNonEmptyString(data.parcelId) &&
    isNonEmptyString(data.trackingNo) &&
    isOptionalString(data.oldCourierId) &&
    isOptionalString(data.newCourierId)
  );
}

export function isSwiftDropEvent(raw: unknown): raw is SwiftDropEvent {
  if (!hasValidBaseEnvelope(raw)) return false;

  switch (raw.type) {
    case "parcel.created":
      return isParcelCreatedData(raw.data);
    case "parcel.status.changed":
      return isParcelStatusChangedData(raw.data);
    case "parcel.assignment.changed":
      return isParcelAssignedData(raw.data);
    default:
      return false;
  }
}
