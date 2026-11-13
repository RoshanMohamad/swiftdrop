# Merchant module

This module owns merchant registration and approval, machine credentials and
OAuth, merchant order submission, webhook configuration, and merchant-facing
order and delivery-log APIs (M02; see `plan.md` §4.1).

Implemented in this module:

- `POST /api/v1/merchant/register`: creates the merchant user and pending
  business application in one transaction.
- `GET /api/v1/admin/merchants` and
  `PATCH /api/v1/admin/merchants/:id/review`: Admin-only application review.

The additive merchant schema is in `packages/db/prisma/schema.prisma` and
`202611100001_merchants`. Reuse the shared auth and contracts. The merchant
order path must use M04's `ParcelsService` rather than duplicate parcel logic;
webhook delivery and attempt logs depend on M08. API clients, OAuth, orders,
webhook configuration and the remaining dashboard views are still pending.
