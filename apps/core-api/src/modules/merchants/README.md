# Merchant module

This module owns merchant registration and approval, machine credentials and
OAuth, merchant order submission, webhook configuration, and merchant-facing
order and delivery-log APIs (M02; see `plan.md` §4.1).

Implemented in this module:

- `POST /api/v1/merchant/register`: creates the merchant user and pending
  business application in one transaction.
- `GET /api/v1/admin/merchants` and
  `PATCH /api/v1/admin/merchants/:id/review`: Admin-only application review.

The additive merchant schema is in `packages/db/prisma/schema.prisma` and the
merchant migrations. Reuse shared auth and contracts. Merchant order creation
uses M04's `ParcelsService`; merchant order listing is scoped by `merchantId`.
Webhook configuration is implemented; webhook delivery and attempt logs depend
on M08. The delivery-log dashboard remains pending that integration.
