# SwiftDrop: Test Report

Run 2026-11-21 on Windows 11, Node v24.22.1, pnpm workspace, Docker 29.9.3, branch `m08-eventing-tests`.
Every row below was run in this session. Numbers are copied from the test output.

## Result summary

| Suite | Command | Result |
|---|---|---|
| core-api unit | `pnpm --filter core-api test` | **21 suites, 289 tests: all passed** |
| web unit | `pnpm --filter web test` | **20 files, 137 tests: all passed** (see note 1) |
| messaging unit | `pnpm --filter @swiftdrop/messaging test` | **2 suites, 13 tests: all passed** |
| outbox-relay unit | `pnpm --filter outbox-relay test` | **1 suite, 6 tests: all passed** |
| webhook-svc unit | `pnpm --filter webhook-svc test` | **3 suites, 29 tests: all passed** |
| notification-svc unit | `pnpm --filter notification-svc test` | **1 suite, 12 tests: all passed** |
| ai-assistant unit | `pnpm --filter ai-assistant test` | **1 suite, 7 tests: all passed** |
| core-api integration + unit, with coverage (real Postgres, RabbitMQ, MinIO) | `pnpm --filter core-api test:integration` | **27 suites, 480 tests: 479 passed, 1 failed** in the last full run (see notes 2 and 3) |
| core-api `auth.integration.test.ts`, run on its own | `jest test/auth.integration.test.ts` | **104 tests: all passed** (166 s) |
| core-api `merchants.integration.test.ts`, run on its own | `jest test/merchants.integration.test.ts` | **22 tests: all passed** |
| webhook-svc integration | `pnpm --filter webhook-svc test:integration` | **1 suite, 6 tests: all passed** |
| notification-svc integration | `pnpm --filter notification-svc test:integration` | **1 suite, 5 tests: all passed** |
| outbox-relay integration | `pnpm --filter outbox-relay test:integration` | **1 suite, 3 tests: all passed** |

Unit total: 493 tests, all passing. Integration total (four services) in the last full runs: 494 tests, 493 passing, 1 failing (a timeout, note 3). That failing test, and the whole suite it belongs to, pass when run on their own. **I did not get one single full run with every test green.**

### Notes on failures and instability

1. **web:** in the first all-workspace `pnpm test` run, 2 tests in `src/features/auth/forms.test.tsx` failed on 11 s timeouts while other suites ran in parallel. The file passed 4/4 when run alone, and the whole web suite passed 137/137 when run on its own afterwards. Treated as load-related; not investigated further.
2. **Merchant approval race: fixed.** `merchants.integration.test.ts` "concurrent decisions" failed once in a full run with Prisma `P2028` instead of `MERCHANT_ALREADY_REVIEWED`. It did not reproduce in 6 normal and CPU-loaded runs, so I reproduced the mechanism directly with a new test that makes a competing reviewer hold the merchant row lock for 6.5 s. Before the fix that test failed with `Received: "P2028"`. Cause: `MerchantsService.review()` runs in a Prisma interactive transaction with Prisma's default 5 s timeout, so a request waiting on the row lock behind a slow reviewer died with a raw transaction error (a 500) instead of a 409. The transaction now has `{ maxWait: 10000, timeout: 20000 }`. The existing assertion is unchanged; the merchants suite passes 22/22 alone and inside the last full run. The transaction logic itself is unchanged. I could not prove this was the exact cause of the original one-off failure, only that this mechanism produces the identical error and is now covered.
3. **Slow-run timeout in the auth suite (open).** In the last full core-api run, `auth.integration.test.ts` "lists only the caller's live sessions..." exceeded the 180 s limit. In that run the whole auth suite took 1086 s, against 166 s when run on its own, and the machine had only about 670 MB free memory. The test passes alone (50 s) and the whole suite passes alone (104/104). I treat this as machine starvation, not a defect, but it means the full run is not reliably green on this laptop. The earlier two timeouts at the 5 s default were fixed by the config change below.
4. **Fixed earlier in this run:** two tests in `auth.integration.test.ts` ("creates first/subsequent admins..." and "lets only an Admin read the trail...") failed with `Exceeded timeout of 5000 ms`. They chain many cost-12 bcrypt hashes. `jest.config.cjs` set `testTimeout: 180000` only inside each project, which Jest did not apply; the value now also sits at the top level. The coverage gate was not touched. A type error in my own new scope test (`pnpm typecheck` rejected an invalid OAuth error code) was also fixed; typecheck is clean.
5. A direct Jest invocation with a path after `--selectProjects` made Jest treat the path as a project name and run everything; seven suites that import Express then reported `Cannot find module 'debug'`. It did not reproduce with `pnpm --filter core-api test` (21/21). The cause is unexplained.

## Coverage (core-api, unit + integration projects combined)

From the last full `pnpm --filter core-api test:integration` run above (479 of 480 tests passing):

| Metric | Value |
|---|---|
| Lines | **92.62%** |
| Statements | 91.48% |
| Branches | 85.45% |
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

- **Relay health in `/api/ready`:** implemented in code (`core-api/src/app.ts`, `shared/relay-health.ts`; reports `outboxRelay` and returns 503 `degraded` when the relay is down). `relay-health.unit.test.ts` is part of the passing core-api unit run. CLAUDE.md still describes this as open, so the two disagree; neither was edited.
- **Receipts against live MinIO:** exercised by `receipts.integration.test.ts` against a Testcontainers MinIO and it passed. This is a containerised MinIO, not the Compose `minio` service.
- **Merchant approval concurrency:** a new regression test covers a reviewer waiting behind a slow lock holder (see note 2).
- **Return to sender:** no enum value added; awaiting the team.
- **merchantId type (C-14):** unchanged.

## Clean-start check (fresh clone of `m08-eventing-tests`, 2026-11-21)

Followed the README setup in a fresh clone on Windows with Docker, under a separate compose project name so no existing volumes were touched.

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm auth:keys:generate`, `pnpm db:generate` | Passed |
| `docker compose up -d --wait` (starts the whole stack, not only infrastructure) | In-container `migrate` and both `provision-*` jobs passed; every service reached healthy. **nginx failed** (fixed, below) |
| `/api/ready` through the gateway with the relay running | `200 {"status":"ready","outboxRelay":"ready"}` |
| Relay stopped, then restarted | `503 {"status":"degraded","outboxRelay":"unreachable"}`, then `200 ready` |
| Host-side `pnpm db:migrate`, `db:seed`, `services:provision`, then `pnpm dev` | **Not completed**: see the port issue below; `pnpm dev` was not run (low memory on the test machine) |

Found and fixed (committed):

- **nginx exited 127.** On Windows with `core.autocrlf=true`, `deploy/nginx/40-tls.sh` was checked out with CRLF. Fixed with a `.gitattributes` (`*.sh text eol=lf`).
- **`http://localhost` showed the nginx welcome page and 404ed `/api/`.** The image kept the stock `conf.d/default.conf`, which also listens on IPv6. The Dockerfile now removes it and the gateway also listens on `[::]:80`. Verified on `localhost` and `127.0.0.1`.

Found and **not** fixed (needs a team decision):

- **Postgres host port.** `compose.yaml` publishes Postgres on host port **5433** (commit `bcf7150`), but `.env.example`, the README and the compose `seed` service use **5432**. Host-side `pnpm db:migrate`/`db:seed`/`pnpm dev` therefore connect to 5432. On the test machine another process already owns 5432, so they failed with `P1000` authentication errors. CLAUDE.md lists postgres at :5432. Either `compose.yaml` goes back to 5432 or `.env.example` and the README move to 5433.
- **Stale local volumes.** A developer who ran the stack before 14 Nov has a `postgres-data` volume with a failed `202611130001_dispatch_capacity` migration, and `docker compose up` stops with `P3009`. The fix is `docker compose down -v` on a disposable database; this was not run against the existing volume.
- **Image builds need registry access.** A rebuild during the check failed with `ETIMEDOUT` reaching `registry.npmjs.org` from inside Docker; this was a network problem on the test machine, not a repository problem.

## Not verified

- The host-side path (`pnpm db:migrate`, `db:seed`, `pnpm dev`) from a fresh clone, because of the Postgres port mismatch above.
- Browser behaviour, phone PWA install and the manual test plans in the README.
- Line coverage of web, relay, webhook-svc, notification-svc and ai-assistant.
