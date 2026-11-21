# SwiftDrop: Test Report

Run 2026-11-21 on Windows 11, Node v24.22.1, pnpm workspace, Docker 29.9.3, branch `m08-eventing-tests`.
Every row below was run in this session. Numbers are copied from the test output.

## Result summary

| Suite | Command | Result |
|---|---|---|
| core-api unit | `pnpm --filter core-api test` | **21 suites, 289 tests: all passed** |
| web unit | `pnpm --filter web test` | **20 files, 137 tests: all passed** (see note 1) |
| messaging unit | `pnpm --filter @swiftdrop/messaging test` | **3 suites, 16 tests: all passed** (3 new: workspace path resolution) |
| outbox-relay unit | `pnpm --filter outbox-relay test` | **1 suite, 6 tests: all passed** |
| webhook-svc unit | `pnpm --filter webhook-svc test` | **3 suites, 29 tests: all passed** |
| notification-svc unit | `pnpm --filter notification-svc test` | **1 suite, 12 tests: all passed** |
| ai-assistant unit | `pnpm --filter ai-assistant test` | **1 suite, 7 tests: all passed** |
| core-api integration + unit, with coverage (real Postgres, RabbitMQ, MinIO) | `pnpm --filter core-api test:integration` | **27 suites, 480 tests: all passed** (265 s, final run with free memory; see notes 2 and 3) |
| core-api `auth.integration.test.ts`, run on its own | `jest test/auth.integration.test.ts` | **104 tests: all passed** (166 s) |
| core-api `merchants.integration.test.ts`, run on its own | `jest test/merchants.integration.test.ts` | **22 tests: all passed** |
| webhook-svc integration | `pnpm --filter webhook-svc test:integration` | **1 suite, 6 tests: all passed** |
| notification-svc integration | `pnpm --filter notification-svc test:integration` | **1 suite, 5 tests: all passed** |
| outbox-relay integration | `pnpm --filter outbox-relay test:integration` | **1 suite, 3 tests: all passed** |

Unit total: 496 tests, all passing. Integration total (four services), from one `pnpm test:integration` run with exit code 0: 494 tests, all passing (core-api 480, webhook-svc 6, notification-svc 5, outbox-relay 3).

### Notes on failures and instability

1. **web:** in the first all-workspace `pnpm test` run, 2 tests in `src/features/auth/forms.test.tsx` failed on 11 s timeouts while other suites ran in parallel. The file passed 4/4 when run alone, and the whole web suite passed 137/137 when run on its own afterwards. Treated as load-related; not investigated further.
2. **Merchant approval race: fixed.** `merchants.integration.test.ts` "concurrent decisions" failed once in a full run with Prisma `P2028` instead of `MERCHANT_ALREADY_REVIEWED`. It did not reproduce in 6 normal and CPU-loaded runs, so I reproduced the mechanism directly with a new test that makes a competing reviewer hold the merchant row lock for 6.5 s. Before the fix that test failed with `Received: "P2028"`. Cause: `MerchantsService.review()` runs in a Prisma interactive transaction with Prisma's default 5 s timeout, so a request waiting on the row lock behind a slow reviewer died with a raw transaction error (a 500) instead of a 409. The transaction now has `{ maxWait: 10000, timeout: 20000 }`. The existing assertion is unchanged; the merchants suite passes 22/22 alone and inside the final full run. The transaction logic itself is unchanged. I could not prove this was the exact cause of the original one-off failure, only that this mechanism produces the identical error and is now covered.
3. **Slow-run timeout in the auth suite (not reproduced on a healthy machine).** In an earlier full core-api run, `auth.integration.test.ts` "lists only the caller's live sessions..." exceeded the 180 s limit while the whole auth suite took 1086 s and the machine had about 670 MB free memory. After closing other applications (about 1.2 GB free) the identical command passed 27/27 suites in 265 s. The test also passed on its own (50 s) and the whole auth suite passed on its own (104/104). The cause was machine starvation, not the code; on a low-memory machine the full integration run can still time out.
4. **Fixed earlier in this run:** two tests in `auth.integration.test.ts` ("creates first/subsequent admins..." and "lets only an Admin read the trail...") failed with `Exceeded timeout of 5000 ms`. They chain many cost-12 bcrypt hashes. `jest.config.cjs` set `testTimeout: 180000` only inside each project, which Jest did not apply; the value now also sits at the top level. The coverage gate was not touched. A type error in my own new scope test (`pnpm typecheck` rejected an invalid OAuth error code) was also fixed; typecheck is clean.
5. A direct Jest invocation with a path after `--selectProjects` made Jest treat the path as a project name and run everything; seven suites that import Express then reported `Cannot find module 'debug'`. It did not reproduce with `pnpm --filter core-api test` (21/21). The cause is unexplained.

## Coverage (core-api, unit + integration projects combined)

From the final full run above (`pnpm test:integration`, core-api 480 of 480 tests passing):

| Metric | Value |
|---|---|
| Lines | **92.56%** |
| Statements | 91.41% |
| Branches | 85.37% |
| Functions | 91.42% |

The 80% line gate is in `apps/core-api/jest.config.cjs` (`coverageThreshold: { global: { lines: 80 } }`) and was not changed. It is measured over the service and domain files listed in `collectCoverageFrom` (module services, pricing strategy, dispatch capacity, auth jwt/password/cleanup/transactions, users admin, service auth/notifications/webhooks/signing, merchant webhook security), not over routes or adapters. The gate did not fail in that run.

The older figure of 28.68% lines was for the unit project only and has not been re-measured. Unit tests alone do not reach 80%, because the auth, parcels, courier, dispatch, merchants and receipts services are exercised by integration tests.

Coverage of the other workspaces (web, outbox-relay, webhook-svc, notification-svc, ai-assistant) was not measured.

## Required test groups

| Group | Where | Status |
|---|---|---|
| Pricing contract: Colombo to Kandy, 2 kg = 57000 cents, against every strategy | `core-api/test/pricing-contract.unit.test.ts` | Passed |
| Merchant token without `orders:write` gets 403 on `POST /merchant/orders` | `core-api/test/merchant-orders-scope.unit.test.ts` (new, 3 tests: 403, 201 with scope, 401 without token) | Passed. Uses the real `authenticateMerchantClient`, `requireMerchantScope` and error handler with a fake service, so no database |
| Courier cannot update another courier's parcel (403, attempt logged; proof lookup 404) | `core-api/test/dispatch.integration.test.ts` | Passed |
| Customer gets 404 for a foreign parcel | `core-api/test/auth.integration.test.ts` | Passed. 404 assertions exist at several lines; I did not read each one to confirm it is the customer-parcel case |
| One status update gives exactly one notification and one signed webhook, also under broker redelivery | `core-api/test/eventflow.integration.test.ts` | Passed |
| Failing endpoint retried, then dead-lettered; HMAC signature and timestamp | `webhook-svc/test/eventflow.integration.test.ts`, `processor.unit.test.ts`, `security.unit.test.ts` | Passed |
| Relay publishes to a real broker and sets `published_at` only after confirm | `outbox-relay/test/relay.integration.test.ts` | Passed |
| Receipt PDF generation, signed download and regeneration against live MinIO | `core-api/test/receipts.integration.test.ts` | Passed (MinIO started by Testcontainers) |

Integration retry waits are shortened to 400 ms through a test seam; the production 30 s x 2^attempt schedule is checked by unit tests only.

## Known open issues (status as of this run)

- **Relay health in `/api/ready`:** implemented (`core-api/src/app.ts`, `shared/relay-health.ts`; reports `outboxRelay` and returns 503 `degraded` when the relay is down). Verified live twice (compose stack and `pnpm dev`): relay stopped gives 503 `unreachable`, restarted gives 200 `ready`. `relay-health.unit.test.ts` is part of the passing core-api unit run. CLAUDE.md was updated to match.
- **Receipts against live MinIO:** exercised by `receipts.integration.test.ts` against a Testcontainers MinIO and it passed. This is a containerised MinIO, not the Compose `minio` service.
- **Merchant approval concurrency:** a new regression test covers a reviewer waiting behind a slow lock holder (see note 2).
- **Return to sender:** no enum value added; awaiting the team.
- **merchantId type (C-14):** unchanged.

## Clean-start check (fresh clone of `m08-eventing-tests`, 2026-11-21)

Followed the README setup in a fresh clone on Windows with Docker, under a separate compose project name so no existing volumes were touched.

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm auth:keys:generate`, `pnpm db:generate` | Passed (key generation correctly refuses to run twice) |
| `docker compose up -d --wait` (starts the whole stack, not only infrastructure) | In-container `migrate` and both `provision-*` jobs passed; every service reached healthy. **nginx failed at first** (fixed, below) |
| `/api/ready` through the gateway, relay running | `200 {"status":"ready","outboxRelay":"ready"}` |
| Relay stopped, then restarted | `503 {"status":"degraded","outboxRelay":"unreachable"}`, then `200 ready` |
| Host-side `pnpm db:migrate`, `pnpm db:seed`, `pnpm services:provision` (x2) | Passed once `.env.example` pointed at port 5433 (below) |
| `pnpm dev` | All six processes started (core-api, web, outbox-relay, webhook-svc, notification-svc, ai-assistant). outbox-relay connected to the broker; `/api/ready` reported `outboxRelay: ready` |

Found and fixed (all committed on this branch):

1. **nginx exited 127.** On Windows with `core.autocrlf=true`, `deploy/nginx/40-tls.sh` was checked out with CRLF. Fixed with a `.gitattributes` (`*.sh text eol=lf`).
2. **`http://localhost` showed the nginx welcome page and 404ed `/api/`.** The image kept the stock `conf.d/default.conf`, which also listens on IPv6. The Dockerfile now removes it and the gateway also listens on `[::]:80`. Verified on `localhost` and `127.0.0.1`.
3. **Postgres host port.** `compose.yaml` publishes Postgres on 5433 (commit `bcf7150`), but `.env.example` and the README said 5432, so host-side migrate, seed and `pnpm dev` failed with `P1000` on machines where another PostgreSQL owns 5432 (the test machine had one). `.env.example` and the README now say 5433. The compose file was not changed. The in-container address `postgres:5432` (and the `seed` service, which shares the Postgres network namespace) is correct and unchanged.
4. **No email reached Mailpit under `pnpm dev`.** notification-svc logged `Contact lookup is unavailable` for every event. Cause: `.env` holds the repo-root-relative path `.local/services/notification-svc/signer.json`, but `pnpm dev` starts each service in `apps/<name>`, so the file was not found (confirmed: `ENOENT` from that directory). core-api already resolved its paths against the workspace root; the two workers did not. Added `resolveWorkspacePath()` to `@swiftdrop/messaging` (3 unit tests) and used it for the notification signer file and the webhook signer and dev-config files. After the fix the stuck events were redelivered and the emails arrived.
5. **CLAUDE.md** still listed relay health in `/api/ready` as open; updated to say it is implemented and verified.

Still true, not fixed:

- **Stale local volumes.** A developer who ran the stack before 14 Nov has a `postgres-data` volume with a failed `202611130001_dispatch_capacity` migration, and `docker compose up` stops with `P3009`. The fix is `docker compose down -v` on a disposable database; this was not run against the existing volume.
- **Image builds need registry access.** One rebuild failed with `ETIMEDOUT` reaching `registry.npmjs.org` from inside Docker; this was a network problem on the test machine.

## Live end-to-end check (HTTP API against `pnpm dev`, fresh database)

Run with small scripts against the running stack, not through a browser. Details are in [../DEMO_SCRIPT.md](../DEMO_SCRIPT.md).

| Step | Observed |
|---|---|
| Customer login | 200 with an access token |
| Quote Colombo to Kandy, 2 kg | `feeCents` 57000 |
| Booking, then the same `Idempotency-Key` again | 201 with a tracking number; the repeat returned the same parcel |
| Public tracking `/api/v1/track/<no>` | status, towns and history only; no PII |
| Dispatcher assigns, courier moves the parcel to Delivered | all 200 |
| Courier jumps Created to Delivered | 409 `ILLEGAL_TRANSITION` |
| Mailpit | exactly one email per event for one parcel (booking confirmed, picked up, in transit, out for delivery, delivered) |
| Merchant: create API client before approval | 403 `MERCHANT_NOT_APPROVED`; after admin approval 201 |
| Client-credentials token | 200, `expires_in` 900 |
| Order with a read-only token | 403 `INSUFFICIENT_SCOPE` |
| Order with `orders:write`; same key again | 201; same tracking number on the repeat |
| Webhook to a local receiver (dev config file) | one POST, attempt 0, valid HMAC-SHA256 `X-SwiftDrop-Signature` over `<timestamp>.<body>`, fresh timestamp, no phone or address in the payload |

Differences between the code and CLAUDE.md found along the way (neither was changed; for the team to decide):

- The illegal-transition error is problem type `illegal_transition` / code `ILLEGAL_TRANSITION`; CLAUDE.md calls it `invalid-transition`.
- The webhook payload's `merchantId` is the merchant UUID; CLAUDE.md says the event contract uses the public string form (`m_1042`). This relates to open issue C-14 and was not touched.
- Assigning a parcel to its current courier returns 200 (a documented no-op), so a live conflict demo needs a second courier.

Not checked live: Google sign-in, the browser UI, the Socket.IO real-time update, the phone PWA, and webhook delivery to a public HTTPS receiver.

## `notifications-realtime` evaluation (nothing was merged)

Checked in an isolated clone of `origin/notifications-realtime` (tip `dcc1b60`). The branch has since merged `origin/main` itself.

| Check | Result |
|---|---|
| Textual merge into `origin/main` (dry run) | **0 conflicts**. The earlier figure of 26 conflicting files no longer applies |
| Textual merge into this branch (dry run) | **2 conflicts**: `.env.example` and `apps/notification-svc/src/server.ts` (the port and path fixes above; the branch rewrote the service into modules) |
| `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm typecheck` | Passed |
| Unit tests | messaging 13, notification-svc **51** (main has 12), core-api 299: all passed |
| Signer path bug (item 4 above) | Not present: its `config.ts` resolves the signer file against the workspace root |

Not run on that branch: integration tests, web tests, and a live `pnpm dev` run. It is an 83-file, about 8,900-line change that includes a Prisma upgrade, so it needs a decision and a full run before merging.

## Not verified

- Anything in a browser: Google sign-in, the web UI, the Socket.IO real-time update, the phone PWA install.
- Webhook delivery to a public HTTPS receiver (only a local receiver through the dev config file was used).
- Line coverage of web, relay, webhook-svc, notification-svc and ai-assistant.
- Integration, web and live behaviour of the `notifications-realtime` branch.
