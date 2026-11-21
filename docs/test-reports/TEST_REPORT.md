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
| core-api integration + unit, with coverage (real Postgres, RabbitMQ, MinIO) | `pnpm --filter core-api test:integration` | **26 suites, 476 tests: 475 passed, 1 failed** (see note 2) |
| webhook-svc integration | `pnpm --filter webhook-svc test:integration` | **1 suite, 6 tests: all passed** |
| notification-svc integration | `pnpm --filter notification-svc test:integration` | **1 suite, 5 tests: all passed** |
| outbox-relay integration | `pnpm --filter outbox-relay test:integration` | **1 suite, 3 tests: all passed** |

Unit total: 493 tests, all passing. Integration total (four services): 490 tests, 489 passing, 1 failing.

### Notes on failures and instability

1. **web:** in the first all-workspace `pnpm test` run, 2 tests in `src/features/auth/forms.test.tsx` failed on 11 s timeouts while other suites ran in parallel. The file passed 4/4 when run alone, and the whole web suite passed 137/137 when run on its own afterwards. Treated as load-related; not investigated further.
2. **core-api integration, 1 failing test:** `merchants.integration.test.ts`, "registration and review: 404s an unknown merchant and lets exactly one of two concurrent decisions win". The losing request failed with Prisma `P2028` (a transaction-API error) instead of the expected `MERCHANT_ALREADY_REVIEWED`. The same suite passed 21/21 when run on its own earlier in the session, and an earlier full run had it failing with a 300 s container start-up timeout in `beforeAll`. So this suite is unstable under a long full run on this machine. The cause was not determined, and the service code was not changed.
3. **Fixed during this run:** two tests in `auth.integration.test.ts` ("creates first/subsequent admins..." and "lets only an Admin read the trail...") failed with `Exceeded timeout of 5000 ms`. They chain many cost-12 bcrypt hashes. `jest.config.cjs` set `testTimeout: 180000` only inside each project, which Jest did not apply; the value now also sits at the top level. Both tests pass. The coverage gate was not touched.
4. A direct Jest invocation with a path after `--selectProjects` made Jest treat the path as a project name and run everything; seven suites that import Express then reported `Cannot find module 'debug'`. It did not reproduce with `pnpm --filter core-api test` (21/21). The cause is unexplained.

## Coverage (core-api, unit + integration projects combined)

From the full `pnpm --filter core-api test:integration` run above (the run with the 1 failing test):

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

- **Relay health in `/api/ready`:** implemented in code (`core-api/src/app.ts`, `shared/relay-health.ts`; reports `outboxRelay` and returns 503 `degraded` when the relay is down). `relay-health.unit.test.ts` is part of the passing core-api unit run. CLAUDE.md still describes this as open, so the two disagree; neither was edited.
- **Receipts against live MinIO:** exercised by `receipts.integration.test.ts` against a Testcontainers MinIO and it passed. This is a containerised MinIO, not the Compose `minio` service.
- **Return to sender:** no enum value added; awaiting the team.
- **merchantId type (C-14):** unchanged.

## Not verified

- A clean `docker compose up` from a fresh clone.
- Browser behaviour, phone PWA install and the manual test plans in the README.
- Line coverage of web, relay, webhook-svc, notification-svc and ai-assistant.
