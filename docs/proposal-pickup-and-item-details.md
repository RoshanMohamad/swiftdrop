# Proposal: pickup address and item details on a parcel

Status: **implemented on branch `web-redesign` (22 Nov 2026), not yet committed.** Built with the recommended choices: Option A (optional in v1), `preferredPickupDate` included, and `handlingNote` values `FRAGILE`, `KEEP_DRY`, `THIS_WAY_UP`, `HANDLE_WITH_CARE`.

What was built:
- Migration `202611220001_pickup_and_item_details` (additive, nullable columns, check that `declared_value_cents >= 0`). **Not yet applied to any long-lived dev database**; the integration tests apply it to a fresh container.
- Contracts: new optional fields on booking, merchant order and merchant registration; pickup is all-or-none; the courier job and parcel responses include the new fields. `api.generated.ts` regenerated.
- Merchants can set a default pickup at registration. There is no endpoint yet to change it afterwards, so existing merchants send pickup details per order.
- Web: new fields in the customer booking wizard, plus pickup and item cards on the parcel detail page and the courier job card.
- Logger redacts `pickupAddress`, `pickupContactName` and `pickupContactPhone`.

Original text of the proposal follows.

## Problem

Today a booking records only *where the parcel goes*, not *where it is collected* or *what it is*.

| Needed by | Currently captured | Gap |
|---|---|---|
| Courier at pickup | `originDistrict` (a district name) | No street address, no contact name or phone. The courier cannot find the pickup point. |
| Courier / dispatcher | weight and dimensions | No description of the contents and no handling note (fragile, etc.). |
| Dispatcher planning | none | No preferred pickup date. |

Source: `quoteRequestSchema`, `bookingRequestSchema` and `merchantOrderRequestSchema` in `packages/contracts/src/index.ts`, and `model Parcel` in `packages/db/prisma/schema.prisma`.

## Proposed new fields

All are stored on `parcels`. Money stays integer cents.

| Field | Type | Required? | Notes |
|---|---|---|---|
| `pickupAddress` | varchar(300) | yes (see decision 1) | Same validation as `recipientAddress`: trimmed, 5 to 300 chars, no control characters. |
| `pickupContactName` | varchar(120) | yes | Same rules as `recipientName`. |
| `pickupContactPhone` | varchar(16) | yes | Same Sri Lankan format and `+94` normalisation as `recipientPhone`. |
| `itemDescription` | varchar(200) | optional | Short free text, for example "2 shirts, boxed". Length-limited. |
| `handlingNote` | enum | optional | Fixed list, for example `FRAGILE`, `KEEP_DRY`, `THIS_WAY_UP`. A fixed list avoids free-text abuse. |
| `declaredValueCents` | int >= 0 | optional | Information only. **Not used for pricing**, and insurance stays out of scope. |
| `preferredPickupDate` | date | optional | A date only, not a time slot. Not a promise. |

Merchants: add a default pickup address, contact name and phone to the merchant profile (the Merchants module owns that table). A merchant order that omits the pickup fields uses the profile defaults. The values are **copied onto the parcel at creation**, so later profile edits don't change old parcels.

## Contract and API impact

- Booking is still two requests. **The quote request does not change**, because pickup details don't affect the price. The new fields go on `POST /api/v1/parcels` (`bookingRequestSchema`) and `POST /api/v1/merchant/orders` (`merchantOrderRequestSchema`).
- Both schemas are `.strict()`, so the new fields must be added explicitly. The schemas are shared by the API and the SPA, and `api.generated.ts` and the OpenAPI doc must be regenerated.
- Response shapes (BFF route groups):
  - **Courier** (`/courier/...`): returns the pickup fields for **assigned parcels only**.
  - **Customer / merchant:** returns their own parcels' fields.
  - **Dispatcher / admin:** returns all.
  - **Public tracking:** returns **none** of them. It stays at status, time and town.
- Idempotency is unchanged. A repeated `Idempotency-Key` returns the original parcel.

## Compatibility (decision 1)

Making pickup fields required would break existing v1 clients, and `CLAUDE.md` says a breaking change goes to `/api/v2`.

- **Option A (recommended):** add the fields as optional in v1.
  - The web booking form requires them.
  - The merchant API falls back to the profile defaults.
  - A parcel with no pickup address can still be created through the API. The dispatcher UI flags it as "pickup address missing" so it can be fixed before dispatch.
- **Option B:** make them required and ship `/api/v2`. This is cleaner but larger, and v1 must keep working for at least one release.

## Data and migration

- One additive Prisma migration with nullable columns. No backfill is needed, and existing parcels simply have nulls.
- No new indexes. These fields are never filtered or searched on.
- `parcel_status_history` is untouched. The pickup fields are not status data.

## Security and privacy

- Pickup address and phone are **PII**. Add `pickupAddress`, `pickupContactName` and `pickupContactPhone` to the logger redaction list. The current list covers `password`, `phone`, `address` and `authorization`, and I haven't checked whether it matches key names exactly or as substrings, so confirm before relying on it.
- **No PII in events.** The pickup fields stay out of the outbox envelope. Consumers that need them fetch through the API. Event contracts and the notification and webhook services need no change.
- Ownership checks stay inside the database query. A courier reading pickup details of a parcel not assigned to them gets 403 and the attempt is logged. Customer and merchant lookups of someone else's parcel return 404.
- Notifications keep storing masked recipients only.
- Validation lives in Zod at the API boundary, and the free-text fields are length-limited.

## Tests required

- **Zod schemas:** valid and invalid phone formats, length limits, strictness, and the merchant-profile fallback.
- **Authorisation:**
  - a courier cannot read pickup details of another courier's parcel;
  - a customer cannot read another customer's pickup details;
  - public tracking never contains pickup fields.
- **Events:** the payload contains no pickup fields.
- **Integration:** book a parcel with pickup details, then read it back as courier, customer and dispatcher.
- **Logging:** the redaction test covers the new keys.

## Likely files touched

`packages/db/prisma/schema.prisma` (plus migration), `packages/contracts/src/index.ts` (plus regenerated `api.generated.ts`), the Parcels and Merchants modules in `core-api`, the courier BFF response, the web booking form and the courier and dispatcher screens, and the logger redaction config.

## Out of scope

- A product catalog (merchants keep products in their own shop system)
- Route optimisation
- Timed pickup slots and pickup scheduling
- Insurance or pricing by declared value
- Online payment

## Open questions for the team

1. Option A or B for compatibility?
2. Should customers (not only merchants) be able to save a default pickup address?
3. What is the final `handlingNote` list?
4. Do we want `preferredPickupDate` now, or leave it for later?
5. C-14 (the `merchantId` type) is unrelated and stays untouched. Confirm nobody wants to bundle it into this change.
