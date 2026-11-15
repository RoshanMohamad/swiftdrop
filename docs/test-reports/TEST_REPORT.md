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
- Event flow: `eventflow.integration.test.ts` (core-api, webhook-svc), `relay.unit.test.ts`, `processor.unit.test.ts`
- Pricing contract tests: `pricing-contract.unit.test.ts`
