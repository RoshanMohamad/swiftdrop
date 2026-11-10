# Merchant web feature

This feature owns the merchant dashboard for API clients, webhook settings,
orders, and delivery logs, plus the admin merchant approval screen (M02; see
`plan.md` §4.1).

The merchant application form is available at `/auth/merchant-register`, and
the Admin review screen at `/admin/merchants`. Both use the generated API
contract. Route/nav mounting is composed in `main.tsx` as a shared M10 seam.

Merchant API-client management, OAuth credentials, orders, webhook settings,
and delivery-log screens remain to be implemented in this feature. MSW
handlers are also pending; do not treat the current screens as fully mocked.
