# Eventing and webhook delivery (M08)

Owner: M08 (plan §4.1 slice 8). Design basis: Design Doc §6, §7.2, §7.7, §9.3. This file describes what is implemented; anything not listed under "Implemented" is not claimed.

## Moving parts

| Piece | Location | Job |
| :-- | :-- | :-- |
| Envelope + admin API schemas | `packages/contracts/src/messaging.ts` | One event envelope; privacy guard that rejects contact/photo/free-text keys; delivery-log and replay schemas |
| `outbox.add(tx, event)` | `apps/core-api/src/shared/outbox` | Producers write the event inside their own Prisma transaction. `eventId` = outbox primary key |
| Topology + helpers | `packages/messaging` | Exchange/queue/binding constants, `declareTopology`, confirmed publisher (mandatory + return handling), reconnect loop, health server |
| Outbox relay | `apps/outbox-relay` | Polls `outbox_events`, publishes with confirms, then marks `published_at` |
| Webhook dispatcher | `apps/webhook-svc` | Consumes `webhooks.q`; signed HTTPS POST; durable attempts; retry queues; DLQ |
| Admin log and replay | `apps/core-api/src/modules/webhooks`, `apps/web/src/features/webhook-admin` | `GET/POST /api/v1/admin/webhook-deliveries…`, `/admin/webhooks` screen |
| Tables | `packages/db` migration `202611070001_messaging` | `webhook_deliveries`, `webhook_attempts`, `webhook_replays` |

## Topology (Design Doc Table 9)

`swiftdrop.events` (topic) → `realtime.q` (`parcel.#`, 60 s TTL), `notifications.q` (`parcel.created`, `parcel.status.*`, quorum, delivery limit 3, dead-letters to `notifications.dlq`), `webhooks.q` (`parcel.#` plus `webhook.replay.requested`, quorum). Failed webhook attempts are handed to `swiftdrop.webhooks.retry` → `webhooks.retry.{30,60,120,240,480,960}.q` (one TTL per quorum queue) → dead-letter to the dedicated direct exchange `swiftdrop.webhooks.return` → `webhooks.q` only. Attempt 6 failing, an unsafe destination, or a poison message goes to `webhooks.dlq` (14 days) through `swiftdrop.dead`.

Recorded deviation from Table 9: `webhooks.q` has one extra binding, `webhook.replay.requested`, so an Admin replay travels through the outbox atomically with its audit row. That key matches neither `realtime.q` nor `notifications.q`, so replays never fan out (tested).

Queue arguments cannot change on a live queue. After pulling this change, delete an older broker's `swiftdrop.events` direct exchange and `swiftdrop.event-log` queue (`docker compose down -v` for a disposable dev broker).

## Correlation ids (NFR-13)

A request's `X-Correlation-ID` (accepted only as 8-64 characters of `A-Z a-z 0-9 . _ -`, otherwise a new UUID is generated) is stored in `outbox_events.correlation_id` by `outbox.add` and by the lifecycle writers, using the request-scoped context in `apps/core-api/src/shared/correlation.ts`. The relay re-validates it and publishes it as the AMQP header `x-correlation-id`. It is deliberately **not** part of the envelope, which stays the consumer contract. `notification-svc`, `webhook-svc`, the realtime consumer and the receipt worker log it; `webhook-svc` also copies it onto retry and DLQ hand-offs so it survives the retry queues. Events written outside an HTTP request, or before migration `202611140002`, have none. It is not sent to merchants in webhook requests.

## Delivery guarantees

- **Producer:** state, history and outbox row commit together. The relay claims rows `FOR UPDATE SKIP LOCKED`, publishes `mandatory` + persistent with publisher confirms, and marks only the confirmed prefix. A crash between confirm and commit republishes the same `eventId` (at-least-once).
- **Unroutable or unconfirmed publish** is a failure, never a success; the row stays unpublished.
- **Malformed outbox rows** (not a valid envelope, or containing contact-data keys) are quarantined (`attempts = 1000`) and logged by identifier only, so they cannot block the queue. Rows written by the old flat-payload relay are quarantined this way.
- **Webhook attempt:** unique `(delivery, run, attempt)` is the claim. Progress is persisted before any hand-off; a hand-off is confirmed before the source message is acknowledged; any failure leaves the source unacknowledged and redelivery repeats only the hand-off. Configuration is reloaded and the body re-signed with a fresh timestamp on every attempt; the original `eventId` is kept for retries and replays.
- **External duplicates:** an HTTP call can succeed before the result is saved, so a merchant may receive a duplicate. Merchants must deduplicate on `X-SwiftDrop-Event-Id`.

## Webhook contract for merchants

`POST <merchant URL>` with the event envelope as JSON and headers `X-SwiftDrop-Event-Id`, `X-SwiftDrop-Attempt` (0..6), `X-SwiftDrop-Timestamp` (unix seconds) and `X-SwiftDrop-Signature: sha256=<hex>` where the value is `HMAC-SHA256(secret, "<timestamp>.<raw body>")`. Reject timestamps older than five minutes. Success is any 2xx within 5 seconds; redirects are never followed. Seven attempts in total (0 plus retries 1..6 after 30/60/120/240/480/960 s, 31.5 minutes of waiting).

Destination rules: HTTPS only, no embedded credentials, and every connection is checked against private, loopback, link-local, CGNAT, multicast, NAT64, 6to4/Teredo and IPv4-mapped ranges at connect time (so DNS rebinding cannot swap the target). `WEBHOOK_DEV_ALLOWED_HOSTS` permits plain HTTP to a local mock receiver and is refused in production.

## Merchant webhook configuration (X-11, C-14)

`merchantId` is the merchant's UUID everywhere: event `data`, `webhook_deliveries.merchant_id` (migration `202611140001_webhook_merchant_uuid`, which deletes old integer-keyed delivery rows) and the Admin filter.

`webhook-svc` reloads the target on every attempt from core-api's internal listener: `GET /internal/v1/webhooks/merchants/{merchantId}/config?eventId=<id>`, authenticated with a five-minute service JWT bound to that event and parcel (scope `webhooks:config`; the notification principal is refused). The merchant in the path must be the merchant named in the persisted event, and an unconfigured, unapproved or suspended merchant returns the same 404, which webhook-svc records as `SKIPPED` (`NOT_CONFIGURED`). Any other failure is `CONFIG_UNAVAILABLE` and retried. Enable it with `WEBHOOK_SIGNER_FILE` (output of `pnpm services:provision --service webhook-svc`) plus `CORE_INTERNAL_URL`; without `WEBHOOK_SIGNER_FILE` deliveries are SKIPPED. Compose runs the provisioning job automatically. The Helm chart does not yet mount a webhook-svc signer Secret.

## Implemented

FR-I1 relay, FR-I2 topology, FR-I4 dispatcher, X-11 merchant webhook configuration lookup (below), FR-I5 Admin-only audited replay, Admin delivery-log/replay screen, `outbox.add`, health/readiness (`/healthz`, `/readyz` on ports 3101 and 3102).

## Not implemented / blocked

- Merchant-facing events are `parcel.created` and `parcel.status.changed`, and they carry `merchantId` only for merchant-owned parcels. Assignment events carry internal courier ids and never carry `merchantId`, so they are not delivered by webhook.
- Status events still include the courier's internal numeric `courierId` in `data`, which webhook merchants receive. Decide whether to drop it from merchant payloads.
- Merchant-scoped delivery log: `WebhooksService.list({ merchantId })` exists for M02 to mount; there is no merchant-facing route yet.
- Dockerfiles and Compose entries for the two services now exist (see [operations.md](operations.md)); CI path filters (X-14) were not checked.
- Graceful shutdown (finish in-flight messages on SIGTERM) is implemented but not verified: no automated test covers it, and the only local run was on Windows, where `kill` does not deliver a catchable signal. Check it on Linux/CI or in a container.

## Manual test: retries, DLQ and replay

Use a disposable database. From the repository root:

```sh
cp -n .env.example .env && pnpm install --frozen-lockfile && pnpm auth:keys:generate
pnpm db:generate && docker compose up -d --wait && pnpm db:migrate && pnpm db:seed
```

1. Create `.local/webhooks/targets.json`: `{"<merchant-uuid>":{"url":"http://localhost:4010/hook","secret":"local-dev-secret-0123456789"}}` and set `WEBHOOK_DEV_CONFIG_FILE=.local/webhooks/targets.json` and `WEBHOOK_DEV_ALLOWED_HOSTS=localhost` in `.env`.
2. Start a receiver that returns 500 (for example `node -e "require('http').createServer((q,r)=>{r.statusCode=500;r.end()}).listen(4010)"`), then `pnpm dev`.
3. Insert a merchant event (replace the two UUIDs with any new ones):
   `docker compose exec postgres psql -U swiftdrop -d swiftdrop -c "INSERT INTO outbox_events (id,event_id,event_type,aggregate_id,payload) VALUES ('<E>','<E>','parcel.created','<P>','{\"eventId\":\"<E>\",\"type\":\"parcel.created\",\"version\":1,\"occurredAt\":\"2026-11-07T10:00:00.000Z\",\"sequence\":1,\"data\":{\"parcelId\":\"<P>\",\"trackingNo\":\"SD-TEST0001-1\",\"merchantId\":\"<merchant-uuid>\",\"to\":\"CREATED\"}}');"`
4. Expect: `outbox_events.published_at` set within ~2 s; `webhook_deliveries.status = PENDING`; a new row in `webhook_attempts` after each of 0, 30, 60, … seconds. After 31.5 minutes plus request time the status is `FAILED` with attempts 0..6 and one message in `webhooks.dlq` (RabbitMQ UI at http://localhost:15672, guest/guest).
4a. To avoid waiting, make the receiver return 200 after a few hits: the delivery turns `SUCCESS` and retries stop. Check the signature with the verification rule above.
5. Sign in at http://localhost:5173/auth/login as `admin@swiftdrop.test`, open **Webhook deliveries** (`/admin/webhooks`), filter Failed, **View details**, enter a reason (3+ characters) and **Replay delivery**. Expect "Replay run 1 queued", status Pending, then (receiver returning 200) Delivered; the receiver sees the **original** `X-SwiftDrop-Event-Id` with attempt 0. Replay history lists your reason and user id.
6. Edge/failure checks: double-click Replay (one run only; a second attempt shows the 409 message); sign in as `dispatcher@swiftdrop.test` and open `/admin/webhooks` (redirected) and call the API (403); stop RabbitMQ mid-flow (relay `/readyz` 503, rows stay unpublished, publishing resumes after restart); set the target URL to `https://127.0.0.1/hook` without the dev allow-list (attempt fails `UNSAFE_DESTINATION`, goes straight to the DLQ); check the page at 360 px, keyboard only, and with reduced motion.

## Checks run for this slice

`pnpm --filter @swiftdrop/messaging test`, `pnpm --filter outbox-relay test`, `pnpm --filter webhook-svc test` (unit: topology, envelope privacy, relay batching/quarantine/ordering, signing, SSRF guard, HTTP sender, full processor state machine including crash/resume and replay); `pnpm --filter webhook-svc test:integration` (real RabbitMQ 4 + PostgreSQL via Testcontainers: delivery, ladder through the retry queues, seven attempts then DLQ, replay, no fan-out, mandatory-routing rejection); core-api integration (envelope on booking; Admin list/detail/replay, concurrency, role/CSRF/origin denial); web tests with axe on the new page.

Cross-service checks in `apps/core-api/test` (real PostgreSQL, RabbitMQ and, for receipts, MinIO via Testcontainers; run on Node 24, which Jest needs to load `minio`): `eventflow.integration.test.ts` drives the real `LifecycleService`, outbox, relay `publishBatch`, production topology, webhook consumer/processor and notification processor, and asserts that one status update gives exactly one notification and one signed webhook (verified signature, original `eventId`), stays at one each when the broker redelivers the event, sends no webhook for a parcel without a merchant, keeps two parcels independent, and carries the request's correlation id across the broker. The merchant URL there comes from a stub config source, not the HTTP source, and the receiver and email/SMS senders are recorders. `receipts.integration.test.ts` covers PDF generation, signed download and regeneration against a live MinIO.
