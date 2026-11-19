# SwiftDrop Handover

## Shared integration

Integration target: `main`. Checked revision: `f9f0582` (`origin/main`), 2026-11-19. M07 work is implemented locally on `feature/m07-courier-pwa`; it is not yet pushed, reviewed, or merged.

| Member | Branch / task | Delivered / merged | Dependencies | Next step |
|---|---|---|---|---|
| [M01](#m01) | `umair-dev` / Identity | Not assessed | Not assessed | Check member checkpoint and branch before integration |
| [M02](#m02) | `feature/Merchant` / Merchant platform | Not assessed | Not assessed | Check member checkpoint and branch before integration |
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

No work recorded.

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