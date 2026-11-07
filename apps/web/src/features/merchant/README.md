# Merchant web feature

This feature owns the merchant dashboard for API clients, webhook settings,
orders, and delivery logs, plus the admin merchant approval screen (M02; see
`plan.md` §4.1).

Keep merchant screens and client integration in this feature. Shared route,
navigation, and mock-service-worker composition belongs to the platform web
foundation (M10) and will be connected as those interfaces are implemented.
