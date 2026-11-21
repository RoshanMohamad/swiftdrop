# SwiftDrop Handover

## Shared integration

Integration target: `main`. Checked revision: `a712b10` (`main`, `origin/main`), 2026-11-21. M07 work is implemented locally on `feature/m07-courier-pwa`; it is not yet pushed, reviewed, or merged.

| Member | Branch / task | Delivered / merged | Dependencies | Next step |
|---|---|---|---|---|
| [M01](#m01) | `umair-dev` / Identity | Not assessed | Not assessed | Check member checkpoint and branch before integration |
| [M02](#m02) | `feature/Merchant` / Merchant platform | Merchant dashboard/webhook history, API scope and idempotency tests, and Merchant MSW handlers implemented locally; uncommitted and unreviewed | M08 delivery list C-17 consumed; M01 review | Request M01 review; finish human browser acceptance before PR integration |
| [M03](#m03) | TBD / Pricing, zones and reports | Not assessed | Not assessed | Confirm branch and check member checkpoint |
| [M04](#m04) | TBD / Customer booking | Not assessed | Not assessed | Confirm branch and check member checkpoint |
| [M05](#m05) | `shazan-dev` / Lifecycle and tracking | Not assessed | Courier consumes parcel lifecycle contract | Check member checkpoint and shared status contract |
| [M06](#m06) | `feature/m06-dispatch` / Dispatch | Not assessed | Assignments feed courier jobs | Check member checkpoint and dispatch integration |
| [M07](#m07) | `feature/m07-courier-pwa` / Courier PWA | Implemented locally; unreviewed and unmerged | M10 review; M05 lifecycle contract | Push branch, open PR to `main`, request M10 review, run phone install check |
| [M08](#m08) | `feature/eventing-webhooks` / Eventing | Not assessed | Not assessed | Check member checkpoint and branch before integration |
| [M09](#m09) | `notifications-realtime` / Notifications and realtime | Not assessed | Not assessed | Check member checkpoint and branch before integration |
| [M10](#m10) | `lavin-dev` / Platform kernel and web | Not assessed | Reviews M07 | Check member checkpoint and branch before integration |

No other member branches were inspected for this checkpoint. No merge order or combined integration verification is claimed.

### Dependency and contradiction register

| ID | Producer -> consumer | Contract / evidence | Readiness and merge order | Status |
|---|---|---|---|---|
| C-15 | M05 -> M07 | `ParcelStatus` and `LifecycleService`; `apps/core-api/src/modules/lifecycle` and `packages/contracts/src/lifecycle.ts` | M07 consumes the existing lifecycle authority; M07 did not add or change a transition table. Integrate M05 before dependent M07 changes if either changes the shared contract. | Existing contract consumed; cross-branch compatibility not rechecked |
| C-16 | M10 -> M07 | M10 review assignment; `AGENTS.md` names M10 Lavin, while `CONTRIBUTIONS.md` and `docs/MEMBER_TASKS.md` name chamoth; `origin/lavin-dev` commits identify Lavin Chamoth Low Chiong / `LavinLowchiong`. | Branch evidence supports routing the M10 review to `LavinLowchiong`; the display-name discrepancy remains for the team to reconcile. | Open documentation discrepancy; reviewer account evidence recorded |
| C-17 | M08 -> M02 | `WebhooksService.list({ merchantId, status, cursor, limit })` in `apps/core-api/src/modules/webhooks/service.ts`; M02 mounts it behind the authenticated merchant route and returns a reduced summary contract. | M08 list service and delivery tables were present at checked base `a712b10`; no M08 implementation was changed. | Consumed locally; M01 review pending |

### M07 checkpoint

- Date: 2026-11-19; member: M07 (`muzny100`); branch: `feature/m07-courier-pwa`; reviewer: M10 (`LavinLowchiong` based on `origin/lavin-dev` commit evidence).
- Task: finish the remaining courier job ownership test, confirmed unassigned-update policy, offline replay verification, PWA installability and bundle budget work. Commits: `8bf96b7`, `a339ca4`, `d89301a`, `f000f6f`, `c0d5866`, `ae3eb45`; handover checkpoint is pending commit. PR: pending.
- Implemented: M07 started and contributor identity recorded; dedicated assigned-only query test; unassigned update returns 403 and logs courier/parcel IDs without recipient phone/address, while proof lookup remains 404; existing same-parcel queue replay order test confirmed; 192px, 512px and maskable PNG icons wired into manifest and service-worker shell; browser install prompt control and component test added.
- Modules/files: `apps/core-api/src/modules/courier`, `apps/core-api/test/courier.unit.test.ts`, `apps/core-api/test/dispatch.integration.test.ts`, `apps/web/src/features/courier`, `apps/web/public`, `AGENTS.md`, `CONTRIBUTIONS.md`, `docs/MEMBER_TASKS.md`.
- Issues resolved: team confirmed the CLAUDE.md rule (403 plus logging) over the existing integration-test expectation of 404. Read/proof lookup behavior remains 404. No transition table was added or changed.
- Automated checks: `pnpm lint`; `pnpm typecheck`; focused courier unit test (9 passed); dispatch integration test without coverage (28 passed); web suite (137 passed); `pnpm --filter web build`; `pnpm --filter web check:budget` (170.22 KB gzip / 250 KB). Running `pnpm --filter core-api test:integration --runInBand test/dispatch.integration.test.ts` also passed all 28 tests but exited nonzero because one-file coverage was below the package's global 80% threshold; rerunning the same suite without coverage passed.
- Limitations: install behavior was simulated in the component test, not verified on a physical phone. The Vite build reports a raw chunk over 500 KB, but the measured gzip total is within budget. The phone needs a trusted HTTPS origin; the current local environment did not provide a phone test.
- Manual phone check setup: start the stack with `pnpm dev` and serve it through a trusted HTTPS origin reachable by the phone. Sign in as a courier and open `/courier`.
  1. Confirm the assigned job list loads and the install control is absent until the browser fires `beforeinstallprompt`.
  2. When `Install app` appears, tap it and accept the platform prompt; expect installation feedback, a home-screen icon, and a standalone app launch.
  3. Dismiss the platform prompt; expect the consumed install button to disappear without claiming installation.
  4. Check the home-screen icon at small and large launcher sizes; verify the maskable art is not clipped. On iOS Safari, where `beforeinstallprompt` is unavailable, the button is expected to remain absent and the browser's Add to Home Screen path must be checked separately.
- Unresolved: perform the physical-phone checks above; push branch and open PR to `main` with M10 as reviewer; reconcile the M10 display-name discrepancy; re-run combined checks after integration.

## M01 — doktur-umair

<a id="m01"></a>

No work recorded.

## M02 — TBD

<a id="m02"></a>

### M02 checkpoint: Merchant webhook delivery history (21 November 2026)

- Branch: `feature/Merchant`; task is uncommitted and unreviewed. Base checked: `a712b10` (`main`, `origin/main`). No commit or push was made.
- Implemented `GET /api/v1/merchant/webhook-deliveries`. It requires an authenticated MERCHANT user, resolves the approved Merchant record from that user ID, and supplies that server-derived merchant UUID to M08's existing `WebhooksService.list`. A client-supplied `merchantId` is rejected by the strict query contract.
- Added a merchant-safe summary contract and OpenAPI/generated client operation. The response contains only event ID/type, delivery status, created/updated timestamps and the opaque next cursor. Merchant ID, internal error codes, attempt history, event payload and Admin replay audit are omitted. No database migration was needed and M08 implementation code was not changed.
- Added `/merchant/webhook-deliveries` with status filtering, 25-row cursor pagination, Previous/Next controls, loading, empty, error and retry states; linked it from the Merchant workspace navigation. Added route tests for unauthenticated and pending accounts, cross-merchant isolation, client merchant-ID rejection, safe fields, status filtering and pagination; added UI tests for loading, empty, error/retry, filtering and page navigation.
- Files: Merchant routes/service and `app.ts`; shared contract source, OpenAPI and generated types; Merchant client/page, route/navigation and page tests; Merchant READMEs; `docs/messaging.md` integration note.
- Checks: `pnpm typecheck`, `pnpm lint`, and `pnpm contracts:check` passed. Focused API integration tests passed (3); Merchant UI tests passed (3). Testcontainers/Vite required elevated process access in this environment. No browser/manual acceptance was performed.
- Limitations: the page intentionally shows delivery summaries rather than attempt-level failure reasons, which remain internal. Existing Merchant MSW handlers are still pending. M01 review and normal PR integration are outstanding.
- Manual check: from the repository root run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm dev`; sign in as an approved Merchant and open `/merchant/webhook-deliveries`.
  1. Confirm recent delivery rows show event type/ID, status and timestamps; no event payload, replay details or secret is shown.
  2. Filter by Failed, Delivered, Pending and Skipped. Confirm empty status filters show a useful empty state.
  3. With more than 25 records, use Next page and Previous page; confirm each page remains limited to the signed-in Merchant.
  4. Repeat as a second Merchant with deliveries for both accounts; confirm only its records appear. Request the API without a session (401), as a pending Merchant (403), and with a `merchantId` query parameter (400).
  5. Check loading/error retry, keyboard use, and a narrow mobile viewport. Runtime and browser acceptance remain unverified until performed.

### M02 checkpoint: order API coverage and Merchant MSW support (21 November 2026)

- Branch: `feature/Merchant`; all work remains local, uncommitted and unreviewed. No commit, push or PR was created.
- Added HTTP integration coverage for a valid merchant client token with only `orders:read` receiving 403 from `POST /api/v1/merchant/orders`, plus a successful `orders:write` request. Added repeated-key coverage proving the second request returns the identical 201 response and creates neither another parcel nor another idempotency record. Existing tests already cover pending/rejected merchant credential denial and private/loopback webhook URL SSRF rejection; no duplicate tests were added.
- Added MSW handlers for Merchant registration, Admin review (existing), API client list/create/rotate/revoke, order list/status filtering, webhook settings/save/secret rotation, and delivery history. Client mock operations update the in-memory collection; delivery fixtures include 30 contract-valid rows for next-page behavior. List handlers cover success, status-filtered and explicit empty responses, and query-selectable RFC 7807 errors. Added fixture-contract and endpoint presence checks.
- Updated the M02 task list to mark the four automated task items complete. No M01 or M08 implementation was edited; C-17's existing M08 `WebhooksService.list({ merchantId })` remains the consumed provider.
- Checks passed: `pnpm contracts:check`, `pnpm lint`, `pnpm typecheck`; focused Merchant API integration (2 passed), Merchant page/MSW tests (10 passed); all core API unit tests (286), all web tests (141), messaging (13), outbox relay (6), webhook service (29), notification service (12), and assistant (7) passed when run package-by-package. Full `pnpm test:integration` passed: core API 481 tests across 26 suites, webhook service 6 tests, notification service 5 tests.
- Aggregate `pnpm test` was attempted but stopped at the core API unit suite because Jest workers exhausted available memory and subsequent child processes could not spawn the configured `C:\\nvm4w\\nodejs\\node.exe` path (`ENOENT`/missing `jest-haste-map`). Running the suites serially/package-by-package passed. `git diff --check` passed. No browser/manual acceptance was performed.
- Manual acceptance preparation (browser plus API client):
  - Start from the repository root with `pnpm auth:keys:generate` (only if development keys are absent), `pnpm db:generate`, `docker compose up -d --wait`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm services:provision --service webhook-svc` (once per local DB), then `pnpm dev`. The seed supplies `admin@swiftdrop.test` / `Local demo passphrase 2026!`, but does not create or approve a Merchant profile. If a usable local Admin is absent, provision one through the supported interactive `pnpm admin:create` command.
  1. In one browser profile, open `/auth/merchant-register`, submit a fresh Merchant application and sign in. Expect the Admin list at `/admin/merchants` to show it as PENDING; attempt credential creation before approval and expect denial.
  2. In the Admin profile, open `/admin/merchants`, review and approve the application. Sign in again as that Merchant; open `/merchant/clients`, create one client with `orders:write` and another with only `orders:read`. Confirm secrets are shown once, store them privately, then exercise rotate/revoke and confirm revoked/rotated credentials behave accordingly.
  3. Use `/api/docs` or an API client to request `/oauth/token` with client-credentials Basic auth and form body `grant_type=client_credentials`. Send a valid order to `POST /api/v1/merchant/orders` with an `Idempotency-Key` of 16–128 allowed characters. Repeat the same body/key: expect 201 with the exact original response/tracking number and one order in `/merchant/orders`. Try the read-only token against the same route: expect 403; an unauthenticated request must fail authentication.
  4. Open `/merchant/webhook`; save a valid public HTTPS receiver URL and rotate the signing secret. Confirm a newly returned secret is visible once. Try loopback/private targets such as `https://127.0.0.1/hook` and expect rejection. Do not use internal addresses to bypass URL validation.
  5. Produce deliveries by creating uniquely keyed merchant orders while the local relay/webhook services are running. Open `/merchant/webhook-deliveries`; check success, failed, pending/retry and skipped records, filter each status, and confirm an unmatched status gives the empty state. Stop/restart the API to check error and Retry behavior. Create at least 26 events before checking Next/Previous pagination.
  6. Register and approve a second Merchant, create its own order/delivery, and repeat history checks in a separate browser profile. Confirm each account sees only its own delivery IDs. Without a session expect 401; with a pending Merchant expect 403; adding a client-supplied `merchantId` query must be rejected. Check no payload, signing secret, internal error, attempt audit or replay details appear.
  7. Repeat keyboard-only and 360px/desktop viewport checks. Confirm loading indicators, focus visibility, filter reset on status change, pagination boundaries, empty/error recovery, and that browser storage/URLs/logs do not expose client secrets or bearer tokens.
- Manual constraints/dependencies: live delivery rows and their statuses require the existing M08 relay/webhook worker and local signer provisioning (C-17); this change does not alter M08. The seeded Merchant user has no Merchant profile, so the supported path is registration then Admin approval, not a seeded-status edit. Browser acceptance remains outstanding. Automated M02 work is ready for M01 code review; do not call it browser-verified or merged until those steps and normal review/integration complete.

## M03 — TBD

<a id="m03"></a>

No work recorded.

## M04 — TBD

<a id="m04"></a>

No work recorded.

## M05 — TBD

<a id="m05"></a>

No work recorded.

## M06 — TBD

<a id="m06"></a>

No work recorded.

## M07 — muzny100

<a id="m07"></a>

See the M07 checkpoint in Shared integration.

## M08 — TBD

<a id="m08"></a>

No work recorded.

## M09 — TBD

<a id="m09"></a>

No work recorded.

## M10 — Lavin

<a id="m10"></a>

No work recorded.

## Legacy history (unattributed)

No prior `handover.md` existed on checked revision `f9f0582`; there were no earlier entries to preserve.
