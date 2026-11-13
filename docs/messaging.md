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

## Delivery guarantees

- **Producer:** state, history and outbox row commit together. The relay claims rows `FOR UPDATE SKIP LOCKED`, publishes `mandatory` + persistent with publisher confirms, and marks only the confirmed prefix. A crash between confirm and commit republishes the same `eventId` (at-least-once).
- **Unroutable or unconfirmed publish** is a failure, never a success; the row stays unpublished.
- **Malformed outbox rows** (not a valid envelope, or containing contact-data keys) are quarantined (`attempts = 1000`) and logged by identifier only, so they cannot block the queue. Rows written by the old flat-payload relay are quarantined this way.
- **Webhook attempt:** unique `(delivery, run, attempt)` is the claim. Progress is persisted before any hand-off; a hand-off is confirmed before the source message is acknowledged; any failure leaves the source unacknowledged and redelivery repeats only the hand-off. Configuration is reloaded and the body re-signed with a fresh timestamp on every attempt; the original `eventId` is kept for retries and replays.
- **External duplicates:** an HTTP call can succeed before the result is saved, so a merchant may receive a duplicate. Merchants must deduplicate on `X-SwiftDrop-Event-Id`.

## Webhook contract for merchants

`POST <merchant URL>` with the event envelope as JSON and headers `X-SwiftDrop-Event-Id`, `X-SwiftDrop-Attempt` (0..6), `X-SwiftDrop-Timestamp` (unix seconds) and `X-SwiftDrop-Signature: sha256=<hex>` where the value is `HMAC-SHA256(secret, "<timestamp>.<raw body>")`. Reject timestamps older than five minutes. Success is any 2xx within 5 seconds; redirects are never followed. Seven attempts in total (0 plus retries 1..6 after 30/60/120/240/480/960 s, 31.5 minutes of waiting).

Destination rules: HTTPS only, no embedded credentials, and every connection is checked against private, loopback, link-local, CGNAT, multicast, NAT64, 6to4/Teredo and IPv4-mapped ranges at connect time (so DNS rebinding cannot swap the target). `WEBHOOK_DEV_ALLOWED_HOSTS` permits plain HTTP to a local mock receiver and is refused in production.

## Implemented

FR-I1 relay, FR-I2 topology, FR-I4 dispatcher, FR-I5 Admin-only audited replay, Admin delivery-log/replay screen, `outbox.add`, health/readiness (`/healthz`, `/readyz` on ports 3101 and 3102).

## Not implemented / blocked

- **X-11 merchant webhook configuration (M02) and X-03 service JWT (M01/M09)** do not exist. Without `WEBHOOK_DEV_CONFIG_FILE`, `webhook-svc` records every delivery as SKIPPED (`NOT_CONFIGURED`). No real merchant can receive webhooks until M02's lookup is wired into `WebhookConfigSource`.
- Nothing publishes events with a `merchantId` yet (merchant orders are M02/M04). The dispatcher is exercised by tests and the manual plan below using hand-written events.
- Only `parcel.created` is produced today; status-change events need M05's `LifecycleService` to call `outbox.add`.
- Merchant-scoped delivery log: `WebhooksService.list({ merchantId })` exists for M02 to mount; there is no merchant-facing route yet.
- Correlation-id propagation API → outbox → consumers (NFR-13, M10) is not done. Dockerfiles, Compose entries and CI path filters for the two new services (X-14) are not added.
- Graceful shutdown (finish in-flight messages on SIGTERM) is implemented but not verified: no automated test covers it, and the only local run was on Windows, where `kill` does not deliver a catchable signal. Check it on Linux/CI or in a container.

## Manual test: retries, DLQ and replay

Use a disposable database. From the repository root:

```sh
cp -n .env.example .env && pnpm install --frozen-lockfile && pnpm auth:keys:generate
pnpm db:generate && docker compose up -d --wait && pnpm db:migrate && pnpm db:seed
```

1. Create `.local/webhooks/targets.json`: `{"7":{"url":"http://localhost:4010/hook","secret":"local-dev-secret-0123456789"}}` and set `WEBHOOK_DEV_CONFIG_FILE=.local/webhooks/targets.json` and `WEBHOOK_DEV_ALLOWED_HOSTS=localhost` in `.env`.
2. Start a receiver that returns 500 (for example `node -e "require('http').createServer((q,r)=>{r.statusCode=500;r.end()}).listen(4010)"`), then `pnpm dev`.
3. Insert a merchant event (replace the two UUIDs with any new ones):
   `docker compose exec postgres psql -U swiftdrop -d swiftdrop -c "INSERT INTO outbox_events (id,event_id,event_type,aggregate_id,payload) VALUES ('<E>','<E>','parcel.created','<P>','{\"eventId\":\"<E>\",\"type\":\"parcel.created\",\"version\":1,\"occurredAt\":\"2026-11-07T10:00:00.000Z\",\"sequence\":1,\"data\":{\"parcelId\":\"<P>\",\"trackingNo\":\"SD-TEST0001-1\",\"merchantId\":7,\"to\":\"CREATED\"}}');"`
4. Expect: `outbox_events.published_at` set within ~2 s; `webhook_deliveries.status = PENDING`; a new row in `webhook_attempts` after each of 0, 30, 60, … seconds. After 31.5 minutes plus request time the status is `FAILED` with attempts 0..6 and one message in `webhooks.dlq` (RabbitMQ UI at http://localhost:15672, guest/guest).
4a. To avoid waiting, make the receiver return 200 after a few hits: the delivery turns `SUCCESS` and retries stop. Check the signature with the verification rule above.
5. Sign in at http://localhost:5173/auth/login as `admin@swiftdrop.test`, open **Webhook deliveries** (`/admin/webhooks`), filter Failed, **View details**, enter a reason (3+ characters) and **Replay delivery**. Expect "Replay run 1 queued", status Pending, then (receiver returning 200) Delivered; the receiver sees the **original** `X-SwiftDrop-Event-Id` with attempt 0. Replay history lists your reason and user id.
6. Edge/failure checks: double-click Replay (one run only; a second attempt shows the 409 message); sign in as `dispatcher@swiftdrop.test` and open `/admin/webhooks` (redirected) and call the API (403); stop RabbitMQ mid-flow (relay `/readyz` 503, rows stay unpublished, publishing resumes after restart); set the target URL to `https://127.0.0.1/hook` without the dev allow-list (attempt fails `UNSAFE_DESTINATION`, goes straight to the DLQ); check the page at 360 px, keyboard only, and with reduced motion.

## Checks run for this slice

`pnpm --filter @swiftdrop/messaging test`, `pnpm --filter outbox-relay test`, `pnpm --filter webhook-svc test` (unit: topology, envelope privacy, relay batching/quarantine/ordering, signing, SSRF guard, HTTP sender, full processor state machine including crash/resume and replay); `pnpm --filter webhook-svc test:integration` (real RabbitMQ 4 + PostgreSQL via Testcontainers: delivery, ladder through the retry queues, seven attempts then DLQ, replay, no fan-out, mandatory-routing rejection); core-api integration (envelope on booking; Admin list/detail/replay, concurrency, role/CSRF/origin denial); web tests with axe on the new page.
