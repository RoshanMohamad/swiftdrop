# Merchant module

This module owns merchant registration and approval, machine credentials and
OAuth, merchant order submission, webhook configuration, and merchant-facing
order and delivery-log APIs (M02; see `plan.md` §4.1).

Keep merchant-specific routes and service logic here. Reuse the shared auth,
contracts, and parcel creation interfaces instead of duplicating them. The
merchant order path depends on M04's `ParcelsService`; webhook delivery and
attempt logs depend on M08. Those integrations will be added with the relevant
features.
