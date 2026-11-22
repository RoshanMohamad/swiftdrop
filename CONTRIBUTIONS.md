# SwiftDrop: Contribution Sheet

Each member owns one vertical slice (database, contracts, backend, frontend, tests). Review pairs
check each other's integration seam. Source: `work_distribution.txt`.

| ID | Member | Branch | Slice | Responsibilities | Main code locations |
|---|---|---|---|---|---|
| M01 | doktur-umair | umair-dev | Identity, access, user administration (also CI/Compose/repo hygiene) | Registration and login (bcrypt-12), RS256 JWT with rotating refresh tokens and family revocation, Google sign-in (PKCE), RBAC and ownership guards, staff provisioning and suspension, auth rate limits, auth pages and admin Users UI | `core-api/src/modules/auth`, `users`; `web/src/features/auth`, `users` |
| M02 | Abdhullah | `feature/Merchant` | Merchant platform | Merchant registration with admin approval, API client create/rotate/revoke, OAuth2 client-credentials (`/oauth/token`), merchant order API with Idempotency-Key, webhook configuration (HTTPS-only, SSRF protection), merchant dashboard and admin approvals UI | `core-api/src/modules/merchants`; `web/src/features/merchant` |
| M03 | umar | `umarali` | Pricing, zones, reports | Zones and versioned pricing rules, quote engine (Strategy pattern, 15-min quotes), daily reports and CSV export, admin zones/pricing/reports UI, p95 benchmark script, AI assistant (MCP) and chat widget | `core-api/src/modules/pricing`, `reports`; `apps/ai-assistant`; `web/src/features/pricing`, `reports`, `assistant` |
| M04 | Nihaaj | `feature/m04-customer-booking` | Customer booking and parcel records | Parcel creation from a quote with idempotency, customer parcel list/detail/timeline (404 on foreign IDs), PDF receipts with MinIO signed URLs, booking wizard and history UI | `core-api/src/modules/parcels`, `receipts`; `web/src/features/parcels` |
| M05 | shazan | `shazan-dev` | Parcel lifecycle, cancellation, public tracking | Single state-machine transition table, append-only status history, optimistic locking, pre-pickup cancellation, re-attempt scheduling, public tracking endpoint (no PII) and mobile tracking page, staff parcel screens | `core-api/src/modules/lifecycle`, `parcels/tracking.ts`; `web/src/features/tracking`, `staff-ops` |
| M06 | Noora | `feature/m06-dispatch` | Dispatch and courier capacity | Unassigned queue, safe assign/reassign transaction (row locks, version recheck, capacity), courier workload views, dispatcher console UI, concurrency tests | `core-api/src/modules/dispatch`; `web/src/features/dispatcher` |
| M07 | muzny100 | `feature/m07-courier-pwa` | Courier delivery and offline PWA | Courier job list (assigned only), Delivered (recipient/photo proof) and Failed (reason) updates, offline operation queue, installable mobile PWA | `core-api/src/modules/courier`; `web/src/features/courier` |
| M08 | Roshan | `feature/eventing-webhooks` | Eventing and webhook delivery | Outbox relay (1 s poll, publisher confirms), RabbitMQ topology and DLQs, webhook dispatcher (HMAC-SHA256, 5 s timeout, 6 retries), admin webhook replay and logs UI | `apps/outbox-relay`, `apps/webhook-svc`, `packages/messaging`; `web/src/features/webhook-admin` |
| M09 | akeel | `notifications-realtime` | Notifications and realtime | Notification worker (Mailpit email, mock SMS, dedup by eventId, masked recipients), Socket.IO gateway with Redis adapter and public/private rooms, realtime client hooks | `apps/notification-svc`, `core-api/src/modules/realtime`; `web/src/shared/realtime` |
| M10 | Lavin Chamoth Low Chiong (LavinLowchiong) | `lavin-dev` | Platform kernel and web foundation | App shell, design tokens and role guards, RFC 7807 errors, redacted logger, correlation IDs, cursor pagination, OpenAPI generation and typed client, MSW mocks, bundle budgets and accessibility checks, seeds | `core-api/src/shared`, `app.ts`; `web/src/shared`, `mocks`, `routes.tsx` |

## Review pairs

M01 and M02 (human auth and machine identity), M03 and M04 (quotes and booking), M05 and M06
(lifecycle and dispatch locks), M07 and M10 (courier PWA and web foundation), M08 and M09
(event producers and consumers).

## Git identities (inferred from commit history, 22 November 2026)

Team names in the table above differ from git author names. The mapping below is inferred from branch
names, commit authorship and `docs/handover.md`; each member should confirm theirs before submission.
Commit counts are across all branches and include merge and documentation commits, so they show activity,
not marks.

| ID | Member (team name) | Git author name(s) seen | Commits |
|---|---|---|---|
| M01 | doktur-umair | doktur-umair, UMAIR M.H.M, umair | 15 |
| M02 | Abdhullah | abdhullah-mn, Abdhullah Noufal | 21 |
| M03 | umar | UmarYusuf03, Ali Y.A.M.M.U | 17 |
| M04 | Nihaaj | Nihaaj Ahamed | 5 |
| M05 | shazan | Shazan, Shazan Faslan | 5 |
| M06 | Noora | NooraRafiuddeen | 2 |
| M07 | muzny100 | muzny100 | 7 |
| M08 | Roshan | RoshanMohamad, RoshanSM | 59 |
| M09 | akeel | Mohamed Rishan Akeel | 17 |
| M10 | Lavin Chamoth Low Chiong | Lavin Chamoth Low Chiong (LavinLowchiong) | 7 |

M05's and M06's commit counts are low; check their branches for work that was merged under another
author's name before presenting those rows.

## Branches

M01: umair - origin/umar
M02:Abdhullah - feature/Merchant
M03: umar - umarali
M04:Nihaaj - feature/m04-customer-booking
M05-shazan - shazan-dev
M06- Noora  - feature/m06-dispatch
M07- muzny100 - feature/m07-courier-pwa
M08- Roshan - feature/eventing-webhooks
M09- akeel - notifications-realtime
M10- chamoth -lavin-dev