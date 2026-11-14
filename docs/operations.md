# Operations slice: dispatch, courier, notifications, realtime

Covers plan slices M06 (dispatch and courier capacity), M07 (courier delivery and offline PWA) and M09 (notifications and realtime). The code was added on `integration/merge-all` by an unassigned contributor; see [handover.md](../handover.md#shared-integration) for attribution and review status.

## Dispatch and courier capacity (FR-D1..D3)

Tables (migration `202611130001_dispatch_courier`, single `schema.prisma` per C-03):

| Table | Purpose |
| :-- | :-- |
| `courier_profiles` | One row per courier user: `on_duty`, `capacity` (1-100), `workload`. |
| `parcel_assignments` | The current courier of a parcel (one row per parcel). `released_at` is set when the parcel is delivered, cancelled or finally failed, so capacity is returned exactly once. |
| `courier_operations` | Ledger of courier status updates; unique `(courier_id, operation_key)` makes offline replay exactly-once and stores proof metadata. |

Endpoints (Dispatcher; Admin inherits): `GET /api/v1/dispatch/parcels?state=unassigned|assigned&zoneId&cursor`, `GET /api/v1/dispatch/couriers`, `PATCH /api/v1/dispatch/couriers/{courierId}` (create profile, duty, capacity), `POST /api/v1/dispatch/parcels/{id}/assign` (`{courierId, version}`).

### Lock protocol (plan X-07)

Every path that changes who carries a parcel, or whether it still counts against a courier, follows one order:

1. lock the affected `courier_profiles` rows in one statement, ascending `user_id` (`modules/dispatch/capacity.ts`);
2. lock the parcel row (`FOR UPDATE`) and re-check `version`;
3. change `workload`, the assignment row, the parcel `version`, and write the outbox event in the same transaction.

Paths using it: assign/reassign (`DispatchService.assign`), duty and capacity changes, courier duty toggle, `LifecycleService.transition` and `LifecycleService.cancel` (release on DELIVERED, CANCELLED and final FAILED after three attempts). Choosing the current courier is a no-op. A stale `version` returns `409 VERSION_CONFLICT`; off-duty and full couriers return `409 COURIER_OFF_DUTY` / `COURIER_AT_CAPACITY`. Reassignment emits `parcel.assignment.changed` with `oldCourierId`/`newCourierId` (ids only).

Open point: courier invitation acceptance still returns setup-pending (C-04/X-15). Until M01 and M06 agree the activation contract, a dispatcher creates the capacity profile (`PATCH /dispatch/couriers/{id}`); the demo seed creates one for `courier@swiftdrop.test`.

## Courier delivery (FR-K1..K3, FR-F6)

Endpoints (Courier only; Admin does not inherit): `GET /api/v1/courier/jobs`, `PATCH /api/v1/courier/jobs/{id}/status` (header `Idempotency-Key` = operation key), `POST /api/v1/courier/jobs/{id}/proof` (raw JPEG/PNG, 2 MB), `PATCH /api/v1/courier/duty`.

- Every read and write is scoped to the courier's own unreleased assignment; another courier's parcel is `404`.
- `DELIVERED` requires `receivedBy`; `FAILED` requires `failureReason` from `RECIPIENT_ABSENT | WRONG_ADDRESS | REFUSED | UNREACHABLE | OTHER`. Re-attempts after FAILED are scheduled by a dispatcher through `PATCH /parcels/{id}/status` (courier gets `409 REATTEMPT_REQUIRES_DISPATCH`).
- Proof photos are stored privately at `proofs/<parcelId>/<uuid>.jpg|png` (magic-number checked) and referenced by key; no public URL is created.
- The ledger row is written inside the lifecycle transaction (`onApplied` hook), so a replay with the same key and body returns the original result (`replayed: true`); the same key with a different body is `409 OPERATION_KEY_REUSED`.
- The binary upload route is mounted before `express.json`; it is bearer-authenticated, so it uses an exact `Origin` check and a rate limit instead of the double-submit CSRF token.

### PWA and offline queue

`/courier` (Courier) is installable (`manifest.webmanifest`, `sw.js` caching the app shell only; API responses are never cached). Updates are queued in IndexedDB with a stable operation key, the expected parcel version (server version plus updates already queued for that parcel) and the user id. Replay (`features/courier/queue.ts`) runs on load, on the `online` event and from "Send now"; it uploads a saved photo first, replays per parcel in order, and only for the original signed-in user. A `404/409` (or other 4xx validation error) pauses that parcel for review instead of overwriting server state; network, 401 and 5xx stop the run and keep everything queued. The last job list is cached in `localStorage` per user for offline viewing.

## Notifications (FR-I3)

`apps/notification-svc` consumes `notifications.q` (`parcel.created`, `parcel.status.*`):

1. validates the envelope (invalid → reject to the DLQ);
2. claims progress in `processed_events` keyed by `eventId` (done → ack without sending; live lease → requeue; expired lease → take over);
3. fetches contact data from core-api's internal listener with a per-event service JWT (X-03; `pnpm services:provision --service notification-svc`, signer file `NOTIFICATION_SIGNER_FILE`); events never carry contact data;
4. renders templates (booking confirmation email + recipient SMS; status email for every status, SMS only for OUT_FOR_DELIVERY, DELIVERED, FAILED), sends email over SMTP (Mailpit in development) and SMS through the mock adapter;
5. records one `notification_logs` row per (event, channel, template) with a masked recipient, so a retry only sends what is still missing.

The X-03 lookup now also serves persisted `parcel.status.changed` events (additive; see C-15). Residual limit: a crash after the provider accepted a message but before its log row is written sends that message again on retry (no provider idempotency in SMTP or the mock SMS adapter).

## Realtime (FR-I6, X-12)

Socket.IO is served by core-api on the public port at `/socket.io`; replicas share rooms through the Redis adapter. `realtime.q` is consumed inside core-api; any replica emits to sockets on every replica.

| Room | Who | Payload |
| :-- | :-- | :-- |
| `public:<trackingNo>` | anyone (`track:join`) | `parcel:status` with status, town, occurredAt, sequence only |
| `private:<parcelId>` | owner customer, merchant owner, assigned courier, dispatcher/admin (`parcel:join`, bearer token) | status with parcelId, assignment signal without courier identity |
| `user:<id>` | the authenticated user only | `parcel:assigned` `{change: assigned|unassigned}` for a courier's job list |

Authorisation is re-evaluated in the database at every join and returns an authorised snapshot (also the reconnect snapshot). Access-token expiry leaves private rooms, emits `auth:expired` and disconnects; reassignment removes the old courier's sockets from `private:<parcelId>` across replicas. The web client (`shared/realtime/useLiveRefresh.ts`) only uses a pushed event as a trigger to refetch through the normal REST endpoints, and polling remains the fallback.

## Tests

- `apps/core-api/test/dispatch.integration.test.ts`: real PostgreSQL; queue order/filter/paging, capacity under concurrency, opposite concurrent reassignments, release on delivered/cancelled/final failure, ownership 404, exactly-once replay, proof checks.
- `apps/core-api/test/{courier,realtime}.unit.test.ts`, `auth-matrix.unit.test.ts` rows, `lifecycle.unit.test.ts`.
- `apps/notification-svc/test`: templates, masking, processor state machine (unit); `PrismaProgressStore` claim/lease/log (integration).
- Web: `features/{dispatcher,courier}` Vitest suites including the offline queue rules.

Run `DISPATCH_TEST_DATABASE_URL` / `NOTIFICATION_TEST_DATABASE_URL` against a throwaway migrated database to skip Testcontainers; the suites truncate tables, so never point them at a database you care about.
