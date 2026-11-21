# Notifications and realtime (M09)

Owner: M09. Review pair: M08. This document describes the implemented FR-I3 and FR-I6 boundaries. Producers never call `notification-svc`, and SwiftDrop does not issue a static M09 API key.

## Component architecture

1. A producer changes parcel state and writes a typed envelope through `outbox.add()` in the same PostgreSQL transaction.
2. M08's outbox relay publishes the stored payload unchanged to the durable topic exchange `swiftdrop.events`. The AMQP routing key is `event.type`, and `messageId` is `event.eventId`.
3. `notification-svc` consumes `notifications.q`, validates the envelope and message ID, claims `(notification-svc, eventId)` in `processed_events`, fetches contact data through the event-bound internal Core API, sends Mailpit email plus mock SMS, and stores masked `notification_logs` rows.
4. The Core API consumes `realtime.q`, advances a per-parcel Redis sequence atomically and broadcasts strict Socket.IO projections through the Redis adapter.
5. Web clients share one managed Socket.IO transport through `usePublicParcelRealtime` and `usePrivateParcelRealtime`, and reload an authorised REST snapshot after reconnects or sequence gaps.

PostgreSQL stores durable notification progress. RabbitMQ provides at-least-once delivery. Redis stores cross-replica socket fan-out and short-lived sequence/rate-limit state. Contact data is never carried in RabbitMQ events.

## Events and queue bindings

All producers import event types and routing keys from `@swiftdrop/contracts`:

| Event                       | Notification binding | Realtime binding | Notification action                      |
| :-------------------------- | :------------------- | :--------------- | :--------------------------------------- |
| `parcel.created`            | exact                | `parcel.#`       | `booking_confirmation`                   |
| `parcel.status.changed`     | `parcel.status.*`    | `parcel.#`       | `status_update`                          |
| `parcel.assignment.changed` | not bound            | `parcel.#`       | none; realtime may evict the old courier |

The envelope contains `eventId`, `type`, `version: 1`, ISO `occurredAt`, a positive per-parcel `sequence`, and event-specific `data`. Consumers reject unknown versions, malformed events and messages whose AMQP `messageId` does not equal `eventId`.

M08 owns the shared topology in `packages/messaging`. M09 declares only `notifications.q`, `notifications.dlq`, `realtime.q` and the exchanges/bindings those consumers require from that shared definition; it does not declare unrelated webhook queues.

## Notification templates and masking

`booking_confirmation` is rendered for `parcel.created` with the tracking number. `status_update` is rendered for every valid `parcel.status.changed` status and may include the town. Assignment-only events never notify.

Only masked recipients are persisted or logged:

| Raw value used by the sender | Stored/logged value |
| :--------------------------- | :------------------ |
| `alice@example.test`         | `a***@example.test` |
| `+94771234567`               | `***4567`           |
| unavailable contact          | `***unavailable`    |

Email and SMS log rows contain the event ID, channel, template ID, masked recipient, `SENT`/`FAILED`/`SKIPPED`, an optional provider message ID, timestamp and an allow-listed error code. Raw email, phone, recipient name and address must not appear in events, logs or `notification_logs`.

Local email uses Mailpit at `smtp://mailpit:1025` in Compose or `smtp://localhost:1025` from the host. SMS is deliberately a mock adapter that logs only the masked phone number.

## Retry, duplicate and DLQ behaviour

- The worker makes the initial attempt plus at most three direct redeliveries to `notifications.q`.
- Direct queue publishing avoids the main topic exchange, so a notification retry cannot re-fire realtime or webhook consumers.
- A retry or DLQ handoff is publisher-confirmed before the source message is acknowledged. A failed confirmation leaves the source unacknowledged.
- Exhausted and invalid messages are published through `swiftdrop.dead` with routing key `notifications` and arrive in `notifications.dlq` from M08's shared topology.
- Invalid messages are parked as a sanitised diagnostic rather than copying potentially sensitive input into the DLQ.
- `processed_events` leases prevent concurrent work, allow expired work to be reclaimed and acknowledge already-`DONE` events without sending again. Per-channel sent state prevents a successful channel being resent during a partial retry.

There is an unavoidable external-send crash window: SMTP may accept a message before the `SENT` row commits. A crash in that interval can produce a duplicate unless the provider honours the stable event ID as an idempotency key.

## Service JWT provisioning and rotation

The internal lookup uses a five-minute RS256 token bound to service identity, audience, scope, `eventId` and `parcelId`. The only notification scope is `notifications:lookup`; the API verifies the live principal and public-key rows. This is not a reusable API key.

From the repository root, with migrations applied and Core API configuration available:

```sh
pnpm services:provision --service notification-svc
pnpm services:status --service notification-svc
pnpm services:rotate --service notification-svc
pnpm services:revoke --service notification-svc --key-id <key-id>
```

Provisioning stores private material and signer metadata under ignored `.local/services/notification-svc/` with restrictive permissions. Compose mounts that directory read-only at `/run/secrets/swiftdrop/notification-svc`; `.dockerignore` prevents it entering the image build context. Rotation installs a new key and leaves the previous public key valid for ten minutes. Restart the worker after rotation so subsequent lookups read the new metadata. Revoke a key or the principal only when deliberately ending its access.

## Socket.IO contract

Socket.IO is attached to the existing Core API HTTP server at `/socket.io`.

Client events:

```ts
socket.emit(
  "room:join",
  {
    kind: "public",
    trackingNumber,
    lastSequence,
  },
  acknowledgement,
);

socket.emit(
  "room:join",
  {
    kind: "private",
    parcelId,
    lastSequence,
  },
  acknowledgement,
);
```

The acknowledgement is `{ ok: true }` or `{ ok: false, code }`, where the safe codes are `RATE_LIMITED`, `NOT_FOUND`, `UNAUTHENTICATED` and `INVALID_ROOM`.

Server events:

```ts
type PublicStatus = {
  status: ParcelStatus;
  occurredAt: string;
  town: string;
  sequence: number;
};

type PrivateStatus = PublicStatus & {
  parcelId: string;
  trackingNumber: string;
};

type Reload = {
  reason: "gap" | "reconnect";
  sequence: number;
};

type Eviction = {
  reason: "expired" | "reassigned" | "revoked";
};
```

Event names are `parcel:status`, `parcel:reload` and `room:evicted`. Clients must validate these DTOs from `@swiftdrop/contracts`; they must not consume RabbitMQ envelopes or Prisma records directly.

### Room rules

- `public:<trackingNo>` requires a valid tracking number, is rate-limited and must match an existing parcel. It receives exactly status, occurrence time, town and sequence—never IDs, contacts, addresses, proof or ownership data.
- `private:<parcelId>` requires a current human access JWT and a database-scoped customer, approved merchant, dispatcher, admin or current courier authorisation. Foreign and nonexistent parcels return the same `NOT_FOUND` response.
- Private membership is rechecked periodically and removed at token expiry, session/account revocation or relevant reassignment. Public membership is not disconnected by private eviction.
- Stale sequences are discarded. A gap or reconnect emits `parcel:reload`; the client reloads an authorised REST snapshot.
- The Redis adapter distributes broadcasts across replicas. HTTP long-polling still requires sticky sessions at the reverse proxy; Socket.IO cannot create proxy affinity.

## Producer integration

Producers depend on `@swiftdrop/contracts` and use M08's transactional outbox helper. They do not import notification implementation code or call `notification-svc`.

```ts
import { ROUTING_KEYS, type ParcelCreatedEvent } from "@swiftdrop/contracts";
import { outbox } from "../shared/outbox/index.js";

const data: ParcelCreatedEvent["data"] = {
  parcelId,
  trackingNo,
  customerId,
  originZone,
  destZone,
  feeCents,
  scheduledDate,
};

await database.$transaction(async (tx) => {
  // Write the parcel change first, using the same tx.
  await outbox.add(tx, {
    type: ROUTING_KEYS.PARCEL_CREATED,
    aggregateId: parcelId,
    sequence: 1,
    data,
  });
});
```

Do not add contact details, names, addresses, proof or free text to event payloads. M08 publishes the stored envelope unchanged using `event.type` and `messageId = event.eventId`.

## Frontend hook

```tsx
const realtimeState = usePublicParcelRealtime(trackingNumber, {
  onUpdate(update) {
    setTimeline((current) => applyStatus(current, update));
  },
  async onSnapshot() {
    setTracking(await getTracking(trackingNumber));
  },
});
```

For an authenticated parcel screen, use `usePrivateParcelRealtime(parcelId, { onUpdate, onSnapshot })`. Both hooks return `connecting`, `connected`, `reconnecting`, `error` or `offline`. The shared client obtains the current access JWT through the in-memory auth transport, supplies its last sequence on reconnect, validates every DTO and never writes a token to browser storage. `createMockRealtimeEmitter()` plus `setRealtimeSocketFactory()` provides an independent-development transport.

## Local start and tests

Use the repository's Node 24 and pnpm versions:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm auth:keys:generate
docker compose up -d postgres redis rabbitmq mailpit
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm services:provision --service notification-svc
pnpm dev
```

To run the notification worker in Compose, keep the Core API running on the host so its internal listener is reachable, then run:

```sh
docker compose up -d --build notification-svc
docker compose exec notification-svc node -e "fetch('http://127.0.0.1:3002/readyz').then(async r=>{console.log(r.status,await r.text())})"
```

The notification health port is intentionally not published. Mailpit remains available at `http://localhost:8025`.

Verification commands:

```sh
pnpm --filter @swiftdrop/contracts typecheck
pnpm contracts:check
pnpm --filter @swiftdrop/db generate
pnpm --filter @swiftdrop/db typecheck
pnpm --filter notification-svc typecheck
pnpm --filter notification-svc test
pnpm --filter notification-svc test:integration
pnpm --filter core-api typecheck
pnpm --filter core-api test
pnpm --filter core-api test:integration
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
docker compose config --quiet
docker compose up -d --build --wait notification-svc
```

## Manual acceptance

1. Create a booking and verify exactly one `booking_confirmation` email in Mailpit.
2. Redeliver the same event ID and verify no second email/SMS send and one completed processing record.
3. Change every valid status and verify `status_update` plus the live public timeline.
4. Inspect the public socket frame and confirm it contains exactly `status`, `occurredAt`, `town` and `sequence`.
5. Join a private room as a foreign user and with a nonexistent parcel ID; both must return `NOT_FOUND`.
6. Reassign a parcel and verify only the old courier receives `room:evicted { reason: "reassigned" }`.
7. Let the access token expire and verify private eviction without disconnecting public tracking.
8. Disconnect/reconnect with a prior sequence and verify one authorised snapshot reload; skip a sequence and verify gap recovery.
9. Stop Mailpit, RabbitMQ and Redis one at a time. Verify explicit not-ready/fallback behaviour, no premature acknowledgement, and recovery after restart.
10. Inspect application logs and `notification_logs`; raw email, phone, recipient name and address must be absent.

## Known limitations and review gates

- M08 must review the shared notification queue/DLQ declaration and the direct retry policy before merge. M09 now consumes `packages/messaging` rather than maintaining a competing queue definition.
- M06's X-08 courier-assignment read model does not exist. The default realtime policy therefore denies courier private joins through the injectable `CourierParcelAccess` boundary.
- The base Compose file does not containerise Core API. `notification-svc` reaches the host's loopback-only internal listener through `host.docker.internal`; a production deployment must put both services on a private network and must not expose the internal listener publicly.
- The mock SMS adapter does not contact a provider. SMTP has the external-send crash window described above.
- Polling needs reverse-proxy stickiness. Redis adapter availability alone is insufficient.
- M08/M09 still need to agree the final `merchantId` type across the generic M08 envelope and M09 event interfaces, and remove the redundant legacy in-process outbox publisher tracked in `handover.md` C-14.
- Missing `town` on a status event causes snapshot reload instead of emitting an incomplete public DTO.
- No static M09 API key exists or should be shared. Service identity is short-lived, event-bound RS256 JWT only.

## Main reconciliation (21 November 2026)

The worker uses the modular runtime and bounded RabbitMQ retries. Main's processor, contact lookup and delivery interfaces remain available to existing event-flow consumers. Only one notification worker is started by Compose. Main's `NOTIFICATION_SVC_PORT`, `CORE_INTERNAL_URL` and `NOTIFICATION_SIGNER_FILE` are accepted as aliases; explicit `NOTIFICATION_PORT`, `INTERNAL_API_URL` and `NOTIFICATION_SIGNER_METADATA_FILE` take precedence. The existing `useLiveRefresh` API delegates to the shared room client; legacy socket join names remain accepted.

The canonical notification-table creation migration is main's `202611130002_notifications`. The new `202611210001_notification_attempts` migration adds the modular worker's attempts column and indexes. The branch-only duplicate `202611130001_notifications` was removed before integration. A development database that already applied that branch-only migration needs a deliberate migration-history reconciliation before applying this merged history; do not reset a database with data you need. No database was changed during conflict resolution.
