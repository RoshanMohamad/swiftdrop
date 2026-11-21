# Merchant web feature

This feature owns the merchant dashboard for API clients, webhook settings,
orders, and delivery logs, plus the admin merchant approval screen (M02; see
`plan.md` §4.1).

The merchant application form is available at `/auth/merchant-register`, and
the Admin review screen at `/admin/merchants`. Both use the generated API
contract. Route/nav mounting is composed in `main.tsx` as a shared M10 seam.

Merchant API-client management, OAuth credentials, webhook settings, the
merchant orders list, and webhook delivery history are implemented in this
feature. Delivery history is paginated and status-filterable; it displays only
merchant-safe event summaries. MSW handlers are still pending; do not treat the
current screens as fully mocked.
