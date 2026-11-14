# CLAUDE.md — SwiftDrop

Parcel delivery and courier management platform for Sri Lanka. Customers book and track parcels, merchants push orders through an API, dispatchers assign couriers, and couriers update status from a mobile-first PWA.

This file condenses the design report (*SwiftDrop Design Documentation*, Oct 2026). Treat the rules below as binding. If code and this file disagree, ask before "fixing" either one.

## Stack

| Concern | Choice |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS (one SPA, role-based routes) |
| Backend | Node.js 20, Express, TypeScript |
| Validation | Zod, with schemas shared by the API and the SPA |
| Database | PostgreSQL 16 + Prisma |
| Messaging | RabbitMQ 3.13, topic exchange `swiftdrop.events` |
| Real-time | Socket.IO + Redis adapter |
| Object storage | MinIO (S3 API): proof-of-delivery photos, PDF receipts |
| Auth | JWT (RS256), Google OIDC (auth code + PKCE), OAuth 2.0 client credentials for merchants |
| Tests | Jest, Supertest, Testcontainers; Vitest + React Testing Library on the frontend |
| Deploy | Docker multi-stage images, Docker Compose locally, Kubernetes + Helm |

## Running it

- `pnpm dev` starts the stack, **including `outbox-relay`**. Events only flow while the relay is running. If you start services any other way, start the relay too.
- The whole system must also come up with a single `docker compose up`. Don't add a step that breaks this.
- `/api/ready` currently reports only the consumer's broker connection. It stays green when the relay is down, so check the relay yourself when events seem to vanish.
- Configuration comes only from environment variables. The repo holds `.env.example` with placeholders. Never commit a real secret; CI secret scanning fails the build.

## Architecture

A **modular monolith plus event-driven workers.** Don't split it into microservices, and don't add a separate BFF service.

**Core API** (`core-api`, :4000) has six modules:

- Auth & Identity: JWT, Google OAuth, RBAC
- Parcels & Tracking: owns the status state machine
- Pricing: strategy per zone and size
- Dispatch: assignment, courier workload
- Merchants & API clients: keys, client credentials
- Reports & Admin: users, zones, KPIs

Also in the Core API: the Realtime Gateway (Socket.IO) and a shared kernel (Zod validation, error handler, PII-safe logger).

**Separate processes:**

- `outbox-relay` polls `outbox_events` every second, publishes with confirms, then sets `published_at`.
- `notification-svc` sends email (Mailpit in dev) and mock SMS.
- `webhook-svc` sends HMAC-signed POSTs to merchants, with retries and a DLQ.
- `ai-assistant` (:5000) is an MCP server; its tools call the REST API with the user's JWT.

Infrastructure: `nginx` (:80/:443, or the Ingress on k8s), `postgres` (:5432), `redis` (:6379), `rabbitmq` (:5672, mgmt :15672), `minio` (:9000).

### Module rules

- **Each module owns its tables.** Never import another module's repository. Call its service instead, e.g. Dispatch calls `PricingService.quote()` and never reads pricing tables. ESLint import rules enforce this, so don't disable them.
- **Every request follows the same chain:** middleware (authenticate → `requireRole(...)` → Zod validate) → thin controller → service → repository (Prisma).
- **Controllers hold no business rules.** Services never touch `req` or `res`.
- **Inject dependencies through constructors**, so tests can use in-memory fake repositories.
- **Route groups act as BFFs.** Each of `/api/v1/customer/…`, `/api/v1/merchant/…`, `/api/v1/courier/…` and `/api/v1/admin/…` shapes its responses for its own screen.

## Roles and access

There are five roles, and each account holds exactly one: `CUSTOMER`, `MERCHANT`, `COURIER`, `DISPATCHER`, `ADMIN`. The guest recipient has no account and uses only the public tracking page.

Every protected request needs **two checks**:

1. **Role check** in middleware: `requireRole('COURIER')`.
2. **Ownership check inside the database query itself**, e.g. `WHERE id = :id AND courier_id = :me`. Never load a record and then check ownership in code.

When the ownership check fails on a customer or courier lookup, **return 404, not 403**, so the response doesn't reveal that the parcel exists. The one exception is a courier updating a parcel not assigned to them: that returns 403 and the attempt is logged.

| Capability | Customer | Merchant | Courier | Dispatcher | Admin |
|---|---|---|---|---|---|
| Create delivery | own | own (API) | – | yes | yes |
| View parcel + history | own | own | assigned | all | all |
| Update parcel status | – | – | assigned | yes | yes |
| Assign / reassign courier | – | – | – | yes | yes |
| Approve merchants | – | – | – | – | yes |
| Manage users, zones, pricing | – | – | – | – | yes |
| Reports | – | own orders | – | yes | yes |
| API keys + webhooks | – | own | – | – | yes |

A merchant can't create API credentials until an admin approves it (`merchants.status` = `APPROVED`).

## Data rules

Tables: `roles`, `users`, `merchants`, `api_clients`, `couriers`, `zones`, `pricing_rules`, `parcels`, `parcel_status_history`, `webhook_deliveries`, `notifications`, `outbox_events`.

- **Money is integer cents** (`fee_cents`, `base_fee_cents`, `per_kg_cents`). Never use floats for currency. Prices are in LKR.
- **`parcel_status_history` is append-only.** Never UPDATE or DELETE its rows. It is both the audit trail and the customer timeline.
- **`parcels.current_status` is denormalised.** Write it in the same transaction as the history row, every time.
- **`parcels.version` gives optimistic locking.** Assignment is `UPDATE … SET courier_id = ? WHERE id = ? AND courier_id IS NULL AND version = ?`. Zero rows updated means a conflict: show it and refresh the queue, never retry silently.
- **Tracking numbers** are `SD-` plus 8 random characters from an unambiguous alphabet plus a check character, e.g. `SD-7KQ2M9XA-P`. Never make them sequential.
- **Pricing rules are versioned** with `effective_from` and `is_active`, so old receipts keep their original price.
- **Secrets:** `api_clients.secret_hash` stores a hash only. `merchants.webhook_secret_enc` is encrypted at rest. `users.password_hash` is null for Google-only accounts, which are linked by `google_sub`.
- **Notifications** store the recipient masked, e.g. `077***4521`.
- **Indexes:** `parcels(tracking_no)`, `parcels(courier_id, current_status)`, `parcels(merchant_id, created_at)`, `parcel_status_history(parcel_id, changed_at)`.

## Parcel state machine

```
CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
CREATED → CANCELLED                      (before pickup only)
OUT_FOR_DELIVERY → FAILED                (reason required)
FAILED → IN_TRANSIT                      (re-attempt scheduled, max 2 attempts)
FAILED → return to sender                (final attempt failed)
```

The report doesn't name a status for "return to sender". The UI designs use a `Returned` badge. Confirm the enum value with the team before adding it.

- All allowed transitions live in **one table in the Parcels module**. The courier API, the dispatcher console and the tests all import it. Never duplicate it.
- An invalid transition returns **409** (`invalid-transition` problem type).
- `DELIVERED` requires proof: the recipient's name, a photo, or both. `FAILED` requires a reason from a fixed list.

## Events and the outbox

**Never publish to RabbitMQ from a request handler.** Every state change follows this pattern:

1. In **one** DB transaction: update `parcels`, insert `parcel_status_history`, insert `outbox_events`.
2. `outbox-relay` publishes the row later.

**Envelope.** Consumers depend on this contract only, never on producer tables:

```json
{
  "eventId": "uuid",
  "type": "parcel.status.changed",
  "version": 1,
  "occurredAt": "ISO-8601",
  "sequence": 4,
  "data": { "trackingNo": "SD-…", "merchantId": "m_1042", "from": "IN_TRANSIT", "to": "OUT_FOR_DELIVERY", "note": null }
}
```

- **No PII in events.** Leave out phone numbers and addresses; consumers fetch them through the API.
- **Delivery is at-least-once, so every consumer must be idempotent.** Record the `eventId` and skip repeats. Use `sequence` to discard events that arrive out of order.
- **Ack only after processing has finished.**
- **Bump `version`** for breaking payload changes.

| Queue | Binding | Consumer | On failure |
|---|---|---|---|
| `realtime.q` | `parcel.#` | Realtime Gateway | Messages expire after 60 s |
| `notifications.q` | `parcel.status.*` | Notification Service | 3 redeliveries, then `notifications.dlq` |
| `webhooks.q` | `parcel.#` | Webhook Dispatcher | Republish to `webhooks.retry.q` |
| `webhooks.retry.q` | direct | none (TTL wait) | TTL `30 s × 2^attempt`, then dead-letters back to `webhooks.q` |
| `webhooks.dlq` | dead-letter | admins (replay button) | Kept 14 days |

**Webhook dispatch:**

- Sign the body with HMAC-SHA256 in the `X-SwiftDrop-Signature` header, and include a timestamp.
- Timeout is 5 s. Make up to 6 attempts (about 30 minutes in total), then move the message to the DLQ and mark it failed.
- Record every attempt in `webhook_deliveries`.
- Retry delays use RabbitMQ TTL and dead-lettering. **Never hold timers in memory.**

**Real-time:**

- Each tracking number gets its own room.
- Logged-in customers may join rooms for their own parcels only.
- The public tracking page gets a reduced payload: status, time and town only.

## Key flows

- **Booking is two requests.**
  1. `POST /api/v1/quotes` returns `{quoteId, fee, expiresAt}`. A quote is valid for 15 minutes.
  2. `POST /api/v1/parcels {quoteId}` with an `Idempotency-Key` header returns 201 `{trackingNo}`.
  - The price is locked to the quote. An expired quote must be recalculated and confirmed again.
  - A repeated `Idempotency-Key` returns the original parcel.
- **Merchant API.**
  1. `POST /oauth/token` (client credentials) returns a 15-minute JWT with scopes.
  2. `POST /api/v1/merchant/orders` checks, in order: the `orders:write` scope, that the merchant is `APPROVED`, then the body.
- **Courier status update.** Check the role and the assignment, validate the transition, then write parcel + history + outbox in one transaction and return 200 straight away. Fan-out happens asynchronously.
- **Google login.** The backend does the authorization code flow with PKCE. The `state` value and PKCE verifier live in a signed cookie. Verify the id_token's signature, `iss`, `aud` and `exp`, then find or create the user by `google_sub`. The SPA never sees Google's tokens.

## Pricing

Use the Strategy pattern: `PricingStrategy.quote(input, rule): Money`, chosen by `PricingStrategyFactory`. Implementations are `StandardPricing`, `ExpressPricing` and `MerchantContractPricing`.

Standard formula: `baseFeeCents + max(0, ceil(weightKg) − 1) × perKgCents`.

Worked example: Colombo → Kandy, small parcel, 2 kg = 45000 + 12000 = 57000 cents = LKR 570.00. Use this as a test fixture.

Add a pricing scheme as a new strategy class. Don't add branches to booking code.

## Security rules

- **Passwords:** bcrypt, cost 12. Never log or store plaintext.
- **Access JWT:** RS256, 15 minutes. Claims are the user ID, role and token ID only. No PII.
- **Refresh token:**
  - Random value, stored hashed, sent as an `HttpOnly; Secure; SameSite=Strict` cookie.
  - Rotated on every use.
  - Reusing an old refresh token revokes the whole token family.
- **Rate limits:** on login and token endpoints, per IP and per account; and per API client.
- **Webhook URLs:** HTTPS only. Reject private and loopback addresses (SSRF protection).
- **Logging:** the logger redacts `password`, `phone`, `address` and `authorization`.
- **Errors to clients:** generic message plus a correlation ID. Stack traces stay in server logs.
- **Proof-of-delivery photos:** serve them through short-lived signed URLs only.
- **Input validation:** Zod at the API boundary. Phone numbers must match Sri Lankan formats, weights must be positive and within limits, and free-text notes are length-limited.

## API conventions

- **Versioning:** everything lives under `/api/v1`. A breaking change goes to `/api/v2`, and v1 keeps working for at least one more release.
- **Resources:** plural nouns, standard HTTP verbs, cursor pagination on lists.
- **Idempotency:** `POST` endpoints that create parcels accept an `Idempotency-Key` header.
- **Errors:** RFC 7807 `application/problem+json` from **one** error middleware, with `type`, `title`, `status`, `detail` and `correlationId`.
- **Docs:** OpenAPI 3 is generated from the Zod schemas and served at `/api/docs`.

## Patterns in use

| Pattern | Where |
|---|---|
| Repository | Every module's data access |
| Strategy | Pricing |
| State | Parcel status transitions |
| Pub/sub | Status events to the consumers |
| Transactional outbox | Event publishing from the Core API |
| Adapter | `EmailSender`, `SmsSender` |
| Factory | `NotificationChannelFactory`, `PricingStrategyFactory` |
| Chain of responsibility | Express middleware |
| Constructor DI | Services |

The courier module depends on the narrow `ParcelStatusUpdater` interface, not on the full parcel service. Keep interfaces small like that.

Keep it simple. **Don't add** microservices, a service mesh or event sourcing without a decision from the team.

## Testing

- **Unit (Jest):** pricing strategies, the state machine, Zod schemas, and services with fake repositories.
- **Integration:** Supertest plus Testcontainers running real Postgres and RabbitMQ. Cover the relay publishing to a real broker and consumers handling duplicates.
- **Authorisation:** every ownership rule needs a test, e.g. a courier can't touch another courier's parcel, a customer can't see another customer's parcel, and a merchant token without `orders:write` can't create orders.
- **Event flow:** one status update produces exactly one notification and one signed webhook. A failing endpoint is retried, then dead-lettered.
- **Contract tests:** run the same suite against every `PricingStrategy` and `SmsSender` implementation.
- **Coverage target:** at least 80% line coverage on the service and domain layers.

## Deployment

- Every service has its own Dockerfile with multi-stage builds. Production images contain compiled JS and production dependencies only.
- Helm deploys to the `swiftdrop` namespace:
  - Stateless services are Deployments with `/healthz` liveness and readiness probes.
  - Postgres, RabbitMQ and MinIO are StatefulSets with PVCs.
  - The Ingress replaces nginx.
  - ConfigMaps hold settings and Secrets hold credentials.
  - Separate values files cover local (kind or minikube) and hosted clusters.
  - An HPA scales `core-api` on CPU.

## AI assistant

- MCP tools: `quote_delivery_fee`, `get_parcel_status`, `list_my_parcels`, `find_zone`.
- Every tool call goes through the REST API with **the user's own JWT**.
- The tools are **read-only**. Don't add tools that create, change or cancel parcels.

## Out of scope

Don't build these unless asked:

- Online card payments (fees are recorded; settlement happens offline)
- Route optimisation
- Warehouse or hub inventory
- Native mobile apps (the courier app is a PWA)

## Known open issues (from the handover note, 14 Nov 2026)

- **Relay readiness:** `/api/ready` doesn't reflect whether `outbox-relay` is running. A stopped relay silently stops all events.
- **Receipts:** receipt generation on `DELIVERED` hasn't been exercised against a live MinIO yet.
- **C-14 (partially resolved):** M08 and M09 type `merchantId` differently, one as a string and one as an integer. Don't change either side until the team picks one type. The event contract uses the public string form (`m_1042`).