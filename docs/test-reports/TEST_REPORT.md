# SwiftDrop: Test Report

Date: 2026-11-15. Environment: Windows 11, Node v24.22.1, pnpm workspace.

## Result summary

| Suite | Command | Result |
|---|---|---|
| core-api unit | `pnpm --filter core-api test` (with `--coverage`) | **20 suites, 285 tests: all passed** |
| core-api integration (Testcontainers) | `pnpm --filter core-api test:integration` | **Not run**: Docker was unavailable on this machine |
| webhook-svc / notification-svc integration | `pnpm test:integration` | **Not run**: needs Docker |
| web, messaging, outbox-relay, webhook-svc, notification-svc, ai-assistant unit | `pnpm test` | **Not run in this session** |

Run on a machine with Docker, `pnpm test` and then `pnpm test:integration` produce the remaining results.
Replace the "Not run" rows with those results before submission.

## M08 area: eventing and webhooks (run 2026-11-19, Docker 29.9.3, branch `m08-eventing-tests`)

| Suite | Command | Result |
|---|---|---|
| messaging unit | `pnpm --filter @swiftdrop/messaging test` | **2 suites, 13 tests: all passed** |
| outbox-relay unit | `pnpm --filter outbox-relay test` | **1 suite, 6 tests: all passed** |
| webhook-svc unit | `pnpm --filter webhook-svc test` | **3 suites, 29 tests: all passed** |
| outbox-relay integration (real Postgres + RabbitMQ) | `pnpm --filter outbox-relay test:integration` | **1 suite, 3 tests: all passed (46.7 s)** |
| webhook-svc integration (real Postgres + RabbitMQ) | `pnpm --filter webhook-svc test:integration` | **1 suite, 6 tests: all passed (40.5 s)** |

- New: `apps/outbox-relay/test/relay.integration.test.ts`. A committed outbox row reaches a bound queue with the
  right routing key, message ID and correlation header, and `published_at` is set only after the broker confirms.
  An unconfirmed publish leaves `published_at` null and the next poll publishes it. A published row is not re-sent.
- Webhook retry then dead-letter, and HMAC signature and timestamp checks, were already covered by
  `webhook-svc/test/eventflow.integration.test.ts`, `processor.unit.test.ts` and `security.unit.test.ts`; re-run green above.
- Relay health in `/api/ready` is implemented (`core-api/src/app.ts`, `relay-health.ts`, `relay-health.unit.test.ts`);
  that unit test was not re-run in this pass.
- Integration retry waits are shortened to 400 ms through a test seam; the production 30..960 s schedule is checked by unit tests only.
- Not run here: core-api, notification-svc, web and ai-assistant suites, and a clean `docker compose up`.

## Coverage (core-api, unit suites only)

| Metric | Value |
|---|---|
| Lines | 28.68% (438 / 1527) |
| Statements | 27.96% |
| Branches | 27.91% |
| Functions | 29.74% |

The project's 80% line gate (`apps/core-api/jest.config.cjs`) is measured over service and domain files
with the unit and integration projects combined (`test:integration` runs both with `--coverage`).
Unit tests alone do not reach it, because the auth, parcels, courier, dispatch, merchants, users, receipts
and webhooks services are exercised by the integration tests. **The 80% target is therefore unverified.**

Per-file results for the unit-only run are in `core-api-unit.txt`.
Files with high unit coverage: `services/auth.ts` 100%, `reports/service.ts` 100%, `auth/jwt.ts` 100%,
`services/webhooks.ts` 96%, `pricing/strategy.ts` 96.6%, `webhook-security.ts` 89%, `assistant/service.ts` 81%.

## Authorisation and event-flow tests present in the repo (not re-run)

- Authorisation: `auth-matrix.unit.test.ts`, `merchant-security.unit.test.ts`, `courier.unit.test.ts`, `dispatch.integration.test.ts`
- Event flow: `eventflow.integration.test.ts` (core-api, webhook-svc), `relay.unit.test.ts`, `relay.integration.test.ts` (outbox-relay), `processor.unit.test.ts`
- Pricing contract tests: `pricing-contract.unit.test.ts`
