# Handover

## Shared integration

Current identity registry: **M01 — doktur-umair**, branch **`umair-dev`**. All existing handover entries below are attributed to M01 based on the user's explicit mapping. They remain historical checkpoints and do not imply that the other nine members' work is complete or integrated.

Work distribution (29 October 2026): [plan.md §4](plan.md#4-team-structure-and-ownership) divides the work into ten vertical delivery slices of ≈ equal complexity, each owning its own database, backend, frontend and tests; silent infrastructure work is excluded from the balance. What a member's section records may differ from that member's planned slice, and that is acceptable.


Local agent instructions checkpoint (2 November 2026): [M01 keeps `AGENTS.md` local](#agents-local-only-2026-11-02). The file is removed from tracking and ignored at the repository root; `plan.md` and this handover remain tracked. Removal from `main` requires the normal reviewed PR. Evidence is limited to this working tree and fetched `origin/main` (`2eb332d`) / `doktur/umair-dev` (`a06a2d5`); no other member branches were reviewed.

### Member status index

| Member | Name | Branch | Planned slice (plan.md §4.1) | Delivered vs merged | Depends on | Next step |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| [M01](#m01) | doktur-umair | `umair-dev` (published as `origin/umair-dev`; earlier M01 work was also published as `origin/dev-umair`) | Identity, access and user administration (+ silent-work steward) | Sprint 1 invitations (`67a77de`) and Sprint 2/Sprint 3 implementation (`e94758f`) are contained in `origin/main` via PR #8; local branch fast-forwarded to `origin/main` at `948133d`; handover sync update is published in PR #9 and awaiting review/merge | X-01/X-13 (M10 review), X-03 (M08/M09 and M02), X-15 (M06 readiness) | Review/merge PR #9; run manual service and existing auth acceptance; unblock courier activation with M06 (C-04); C-02 ownership handoff open |
| [M02](#m02) | TBD | `feature/Merchant` | Merchant platform | Local M02 checkpoints: merchant registration/approval, API-client CRUD, OAuth and merchant order creation; not merged | X-05 (M04 parcel review), X-10/X-11 (delivery logs/webhook config), X-13 (shared route composition review) | Apply migrations and perform order acceptance; get M04 parcel/schema review; continue webhook configuration and M08 coordination |
| [M03](#m03) | UmarYusuf03 | umarali | Pricing, zones and reports | Core deliverables merged into main (PR #10); Milestone 2 completed: FR-B2 AI Assistant Service (MCP read-only tools) & FR-F9 Chat Widget delivered with 100% test coverage | X-04 | Full integration verification with M04 quote consumption |
| [M04](#m04) | TBD | TBD | Customer booking and parcel records | No work recorded (booking baseline exists in M01's local code, C-02) | X-04, X-06, X-09; parcel ownership handoff (R-04) | Take over booking code; merchant/staff variants; coordinate C-02 extraction |
| [M05](#m05) | TBD | TBD | Parcel lifecycle, cancellation and public tracking | Lifecycle transition contract and `LifecycleService` merged into `origin/main` via PR #7 (`497fdb9`, `c366ef7`, `5460dc3`); source branch `shazan-dev`, member identity/history not confirmed. Public tracking baseline exists in M01's local code (C-02). | X-05, X-07; parcel ownership handoff (R-04) | Confirm contributor registry mapping and record attributed checkpoint; continue lifecycle/public-tracking work and coordinate C-02 extraction |
| [M06](#m06) | TBD | TBD | Dispatch and courier capacity | No work recorded | X-06, X-07, X-15 courier readiness (R-03) | Courier capacity tables and assignment protocol; agree courier activation readiness with M01 |
| [M07](#m07) | TBD | TBD | Courier delivery and offline PWA | No work recorded | X-06, X-08 | PWA shell, offline queue, operation ledger |
| [M08](#m08) | TBD | TBD | Eventing and webhook delivery | No work recorded (relay baseline exists in M01's local code, C-02) | X-03 boundary review (R-02), X-11, parcel ownership handoff (R-04) | Move relay to owned service; review X-03 lookup/event boundary with M01/M09/M02 |
| [M09](#m09) | TBD | TBD | Notifications and realtime | No work recorded | X-03 boundary review (R-02), X-08, X-09 | Notification templates, realtime gateway; review X-03 lookup needs with M01/M08/M02 |
| [M10](#m10) | TBD | TBD | Platform kernel and web foundation | No work recorded | X-02/X-13 shared interface/schema review (R-01) | Kernel, shell, typed client, MSW harness; review M01 auth/admin contracts and composition |

Integration target: `main`. Checked 8 November 2026: local `umair-dev` fast-forwarded from `8d7cf9c` to fetched `origin/main` at `948133d`, which contains M01's earlier implementation through PR #8 and subsequent M05 lifecycle changes. No conflicts occurred; incoming changes did not touch the existing local `handover.md` edit. At the time checked, `origin/umair-dev` remained at `b33e15a` and was 11 commits behind the local branch; publication is recorded in the checkpoint below. No automated runtime checks were run for this documentation/sync action, no hosted CI or other member branches were reviewed, and the M01 manual/provider acceptance and peer contract reviews remain pending. Merge order: kernel/contracts (X-01/X-09) → identity/administration + X-03 contracts/schema (X-02/C-03/C-05/C-06) → pricing/parcels/lifecycle (X-04–X-06) → dispatch/courier (X-07/X-08/X-15) → messaging consumers (X-03/X-10–X-12) → shared UI composition (X-13). Combined ten-branch verification was not performed. Release blockers: M10 contract/interface/schema review (C-03/C-05), M08/M09/M02 review of X-03 and actual worker integration (C-06), M06 courier readiness (C-04/X-15), outstanding browser/provider acceptance, unverified member dependencies, and the production gates in auth §12. Historical checkpoints below are preserved.

### Review and coordination actions (8 November 2026)

These are outstanding requests recorded by M01 for coordination. They are **pending acknowledgment**; no other member's agreement, review, or implementation is implied. Detailed member histories remain owned by their contributors. Record results in the relevant member checkpoint and update this shared register/status index after evidence is available.

| Action | Requested owner(s) | Review or deliverable | Source / affected members | Status / completion evidence |
| :-- | :-- | :-- | :-- | :-- |
| R-01 | M10, with M01 | Review X-02/X-13 and C-03/C-05: choose or confirm the shared Prisma schema path; reconcile the planned `req.user` wording with implemented `res.locals.user`/`authFamilyId`/`authGrantId`; review generated Admin schemas, all-role listing, status mutation, and shared session transport. Record decisions and required changes before dependent integration. | [M10](#m10), [M01](#m01), X-02, X-13, [C-03](#c-03), [C-05](#c-05); `plan.md` §§7.5–7.6 | Pending acknowledgment; no M10 branch/PR inspected. Complete when review evidence and any follow-up changes are recorded and the contract is agreed. |
| R-02 | M08, M09; M02 as boundary reviewer; M01 provides implementation | Review X-03/C-06: confirm ownership and shape of the persisted `parcel.created` booking-contact lookup, required claims/scopes/audiences, worker usage and fixtures; identify overlap with relay, notification and merchant webhook responsibilities. Do not treat fixture-only `webhooks:config` as a delivered webhook API. | [M08](#m08), [M09](#m09), [M02](#m02), [M01](#m01), [X-03](#x-03), [C-06](#c-06); `plan.md` §10 | Pending acknowledgment; no counterpart branches/PRs inspected. Complete when owners record the agreed contract and worker integration evidence or document required changes. |
| R-03 | M06 with M01 | Agree X-15 courier profile fields, profile writer/owner, readiness semantics, and atomic invitation acceptance/activation. Until agreed and implemented, retain setup-pending behavior and do not claim courier activation complete. | [M06](#m06), [M01](#m01), X-15, [C-04](#c-04); `docs/auth.md` §4.5 | Pending acknowledgment; no M06 branch/PR inspected. Complete when schema/API ownership and atomic behavior are documented and tested across both slices. |
| R-04 | M01 with M03, M04, M05 and M08 | Plan and review no-behavior-change extraction of pricing, booking, lifecycle/tracking and relay responsibilities from the combined parcel module before new feature work in those areas. Preserve existing behavior and contracts; record file ownership and merge order. | [M03](#m03), [M04](#m04), [M05](#m05), [M08](#m08), [M01](#m01), [C-02](#c-02) | M03 extraction complete on `umarali` (pricing/zones decoupled into `modules/pricing`, contracts and tests preserved); M04, M05, M08 extractions open. |
| R-05 | M01 | Run the manual acceptance steps already listed in the Sprint 2 and Sprint 3 checkpoints: Admin suspension/reactivation/bootstrap, responsive and keyboard review, customer booking/service lookup, and auth regression. Record actual device/browser/provider results; do not mark steps complete before they are run. | [M01](#m01), X-02, X-03, X-13 | Pending user-run acceptance. Automated checks passed as stated in the checkpoints; browser, Google/provider and worker acceptance remain unverified. |
| R-06 | M01 with reviewers above | After required contract decisions and review fixes, run relevant combined checks and update merged status, checked revision, merge order and remaining release blockers. M01's current implementation already reached `main` through PR #8; this action tracks outstanding integration verification. | [M01](#m01), R-01–R-05; `plan.md` §§7.5–7.6, 10 | Pending; dependent reviews and manual acceptance remain outstanding. PR #8 is evidenced by the current `origin/main` merge history; hosted CI and combined checks were not inspected. |

Documentation-only verification for this action register: run `git diff --check -- handover.md` and inspect the rendered Markdown table/anchors. Runtime checks are not applicable. Manual review: confirm each action links to the right member/contract, stays marked pending absent evidence, and does not imply another member accepted the request. No runtime or other-member branch review was performed in this documentation update.

### Dependency and contract register

Contract definitions are in [plan.md §10](plan.md#10-integration-contracts-between-owners). Readiness is **planned** unless stated. Cached integration evidence is limited to the revisions named above; no combined cross-member runtime verification is claimed.

| ID | Producer → Consumer | Contract/source | Affected files | Readiness | Evidence |
| :-- | :-- | :-- | :-- | :-- | :-- |
| X-01 | M10 → all | Kernel, typed client, MSW harness | `apps/core-api/src/shared`, `apps/web/src/shared` | Partial baseline in M01's local code (`shared/problem.ts`, `config.ts`, `rate-limit.ts`); not split to M10 | Local tree only |
| X-02 | M01 → all | Implemented `authenticate`/`requireRole`, `res.locals.user`, `authFamilyId`, `authGrantId` (planned `req.user` wording remains C-03) | `apps/core-api/src/modules/auth`, `modules/users` | Human guards in cached base; transactional Admin grant rechecks local/uncommitted; M10 interface review pending | M01 Sprint 2 checkpoint; C-03 |
| <a id="x-03"></a>X-03 | M01 ↔ M08/M09; M02 boundary review | RS256 service JWT: service kind/subject, per-principal audience, issuer, kid/jti/iat/exp, signed event+parcel claims and scope; `notifications:lookup` GET returns six booking fields for verified persisted `parcel.created`; separate internal loopback listener; `webhooks:config` principal is fixture-only | `packages/contracts/{src/index.ts,src/generate.ts,openapi.json,src/api.generated.ts}`, `packages/db/prisma/{schema.prisma,migrations/202611060001_service_identity/migration.sql}`, `apps/core-api/src/{internal-app.ts,modules/services/*,services-cli.ts,server.ts,shared/config.ts}` | Local API/tooling implemented; 5-minute tokens, 30-second tolerance, per-request live DB revocation, 10-minute key overlap. M08/M09/M02 contract review and actual workers pending. | Local tests/checks in M01 X-03 checkpoint; C-06; no other member branch inspected |
| X-04 | M03 → M04 | `PricingService.quote()`, owner-bound `quoteId`, `validateQuoteForBooking()` | `apps/core-api/src/modules/pricing/*` | Delivered in `umarali`; unit tested; ready for M04 consumption | M03 Milestone 1 checkpoint; 12 unit tests passing |
| X-05 | M04 → M02, M05, M06, M07 | `ParcelsService.createFromQuote()` and variants, idempotency | `modules/parcels/service.ts` | Customer path plus M02 merchant order path implemented locally; merchant path awaits M04 ownership/schema review and integration. | M02 checkpoint 12 November 2026; C-02/C-07 |
| X-06 | M05 → M04, M06, M07, M02 | Transition table, `LifecycleService` | `packages/contracts` | Planned | None |
| X-07 | M05 ↔ M06 | Shared lock protocol | Docs/code not created | Planned | None |
| X-08 | M06 → M07 | Assigned-parcel read model, `parcel.assigned` | Not created | Planned | None |
| X-09 | M08 → all producers | `outbox.add(tx, event)` | `modules/parcels/events.ts` | Relay/outbox implemented locally in the combined module | C-02 |
| X-10 | M08 → M09, M02 | Topology constants, delivery-log API | `packages/messaging` (not created) | Planned | None |
| X-11 | M02 → M08 | Merchant webhook config lookup | Not created | Planned | None |
| X-12 | M09 → web | Socket.IO `parcel:status` / `parcel:assigned` | Not created | Planned | None |
| X-13 | every member → M10 | Feature routes/nav and shared session transport composition | `apps/web/src/features/*`, `main.tsx` | M01 users/auth routes and all-role list/session-expiry updates implemented locally; shared shell/MSW composition and M10 review pending | M01 Sprint 2 checkpoint; C-05 |
| X-14 | every member → M01 | Dockerfile/Compose/CI/Helm entries | `compose*.yaml`, `.github/` | Compose/CI exist from M01; per-service entries planned | Local tree only |
| X-15 | M06 ↔ M01 | Proposed courier profile/readiness contract before invitation activation; `docs/auth.md` §4.5 | `modules/users`, future M06 courier profile module/schema | Unagreed; dispatcher onboarding proceeds independently; courier acceptance returns setup-pending without consuming its invitation until required fields, writer and atomicity are agreed | M01 Sprint 1 implementation checkpoint, 30 October 2026; C-04; no M06 branch inspected |

| X-16 | M02 → Admin web and merchant account | `POST /api/v1/merchant/register`, `GET /api/v1/admin/merchants`, `PATCH /api/v1/admin/merchants/{id}/review`; merchant states `PENDING` → `APPROVED` or `REJECTED` | `packages/contracts`, `packages/db/prisma/{schema.prisma,migrations/202611100001_merchants}`, `apps/core-api/src/modules/merchants`, `apps/web/src/features/merchant` | Implemented locally; schema, contract and type checks passed; not merged. Registration atomically creates the account and pending application; review is Admin-guarded and row-locked. API-client unlock and OAuth are future M02 work. | M02 checkpoint 10 November 2026; manual acceptance pending |
| X-17 | M02 → merchant account and API | `GET/POST /api/v1/merchant/clients`, `POST /api/v1/merchant/clients/{id}/rotate`, `POST /api/v1/merchant/clients/{id}/revoke`; only approved merchants; secret returned once and stored hashed | `packages/contracts`, `packages/db/prisma/{schema.prisma,migrations/202611110001_merchant_api_clients}`, `apps/core-api/src/modules/merchants`, `apps/web/src/features/merchant` | Implemented locally; generated contracts/Prisma client and four package type checks passed; not merged. OAuth consumption of these client credentials is future M02 work. | M02 checkpoint 11 November 2026; manual acceptance pending |
| X-18 | M02 → merchant API routes | `POST /oauth/token`: form-encoded client-credentials grant with HTTP Basic, 15-minute RS256 machine token, distinct audience, granted scopes and revocable token grant | `packages/contracts`, `packages/db/prisma/{schema.prisma,migrations/202611120001_merchant_oauth_access_grants}`, `apps/core-api/src/modules/{auth,merchants}` | Implemented locally; typed contract, issue/verify path and live grant/client/merchant/user checks are present; not merged. Merchant order routes will consume the exported machine auth/scope middleware. | M02 checkpoint 12 November 2026; resource-route acceptance pending |
| X-19 | M02 ↔ M04; M08 consumes the event | `POST /api/v1/merchant/orders`: machine bearer token with `orders:write`, strict shipment/recipient body, merchant-scoped `Idempotency-Key`, current merchant approval, atomic parcel/history/outbox/response write | `packages/contracts`, `packages/db/prisma/{schema.prisma,migrations/202611120002_merchant_owned_orders}`, `apps/core-api/src/modules/{merchants,parcels}` | Implemented locally on M02 branch using the existing parcel module; additive `merchant_id` parcel ownership and merchant-specific idempotency. M04 review/integration and M08 event-consumer verification remain pending. | M02 checkpoint 12 November 2026; C-02/C-07 |

### Contradictions and overlaps

| ID | Members | Positions and evidence | Impact | Proposed resolution | Owner/reviewer | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| <a id="c-01"></a>C-01 | All | `docs/auth.md` phase tables and the earlier handover "Phase 1" entry assign work to layer-based roles A1–E2; [plan.md §4.1](plan.md#4-team-structure-and-ownership) assigns vertical slices M01–M10. | Wrong owner named in an auth phase; duplicated or skipped work | Ownership note in `docs/auth.md` plus plan §4.6 crosswalk; history preserved | M01 / each slice owner | implemented (documentation only) |
| <a id="c-02"></a>C-02 | M01, M03, M04, M05, M08 | Plan assigns pricing (M03), booking (M04), tracking (M05) and relay (M08) to separate owners; the delivered code keeps quotes, booking, public tracking and the AMQP relay in `apps/core-api/src/modules/parcels/{routes,service,events}.ts` and `apps/web/src/features/parcels`. | Merge conflicts and unclear ownership on first touch by new owners | No-behaviour-change refactor PRs split the module per plan §4.1 before feature work in that area | M01 (author) with the receiving owner as reviewer | open |
| <a id="c-03"></a>C-03 | M01, M10; shared-schema owners | Plan §4.1/§7.5 expects per-domain `identity.prisma`; actual `packages/db/prisma.config.ts` and integration harness target one `prisma/schema.prisma`. X-02 says `req.user`, while `modules/auth/index.ts` implements `res.locals.user`/`authFamilyId`; M01's additive invitation and service-principal/key migrations use the current schema path. | Schema ownership/review and downstream authentication consumers need a recorded contract before integration | M10 and affected owners review the additive current-schema migrations or agree a coordinated split; preserve current middleware and reconcile interface wording | M01 with M10 and affected schema/contract reviewers | open (implementation local; shared review and schema-path decision pending) |
| <a id="c-04"></a>C-04 | M01, M06 | FR-A5 requires courier provisioning; `docs/auth.md` §4.5 requires a usable courier profile before activation, but no courier profile schema/module or M06 delivery is available locally. | Activating a role-only courier could imply operational readiness without capacity/profile data | Proposed X-15 defines required fields, responsibility and atomic activation; local Sprint 1 lets admins invite couriers but returns setup-pending on acceptance without consuming the invitation | M01 with M06 | open (runtime guard implemented locally; M06 contract and courier completion are not agreed/claimed) |
| <a id="c-05"></a>C-05 | M01, M10; Admin users consumers | Sprint 1 `GET /admin/users` returned staff-only rows with non-null names/phones; user-approved Sprint 2 requires all five roles and nullable Google profiles. | Existing strict staff-list parsers would reject the broader response; shared session transport also needs same-tab expiry handling. | Added separate Admin summary/page schemas, regenerated OpenAPI/client, updated every discovered list caller together; invitation response shapes preserved. User approved scope here; consumer/peer review remains required before integration. | M01 with M10; any additional consumers found during review | implemented (local; shared review pending) |
| <a id="c-06"></a>C-06 | M01, M08, M09; M02 reviewer | [X-03](#x-03) adds an M01 internal read endpoint in existing `core-api` parcel/outbox state; plan §4.1 assigns webhook delivery to M08 and notification delivery/realtime to M09. This implementation reads only persisted `parcel.created` booking contacts and leaves delivery/templates/webhook config endpoints absent. | Potential overlap with M08 relay/event ownership and M09 notification read/provider responsibilities; event payload and worker expectations may drift despite no textual conflict. | Keep the outbox/event shape unchanged; have M08/M09/M02 review the X-03 proposal and confirm whether this narrowly scoped read endpoint belongs at this boundary. Do not claim worker integration until their actual contract/fixtures are inspected. | M01 author; M08/M09 owners; M02 reviewer | open (local implementation; peer decision unavailable) |
| <a id="c-07"></a>C-07 | M02, M04, M08 | M02 implemented the merchant order route and a merchant-specific creation method in `modules/parcels/service.ts`, plus the additive `parcels.merchant_id` relation/migration, after confirming the planned M04 merchant variant was absent from the available local and cached M04 branch. M08's webhook consumer is not available for review. | Parcel service/schema ownership overlaps M04; event behavior and merchant/customer contact expectations need review before integration. | M04 reviews the variant, merchant ownership relation and migration; M08 reviews `parcel.created` consumer behavior. Keep the implementation on M02 branch, reconcile changes at merge, and do not claim combined readiness until reviews and acceptance are recorded. | M02 author; M04 parcel owner; M08 event consumer | open (user authorized minimal M04 support; peer reviews pending) |

Evidence boundary (6 November 2026): working tree on `umair-dev` at `f6adc50`, cached `origin/main` at `2eb332d`, and cached refs containing `67a77de`. Only ancestry was checked for those refs; their runtime integration was not reverified. No other contributor delivery branch/PR, remote settings or live remote revision was inspected. M02–M10 dependencies remain unverified.

Report presentation checkpoint (31 October 2026): [M01's submission-format revision](#report-submission-format-2026-10-31) delivers a 40-page monochrome PDF with the repository URL on its cover, Appendix B removed and editorial/review commentary removed. This supersedes the earlier 41-page report-format checks in the historical checkpoints. Checked revision: local `umair-dev` at `a06a2d5` plus uncommitted report changes; no application comparison, shared-contract change, other-branch inspection or merged-main verification was part of this request. Contribution names and registration numbers in Appendix A still require team input.


<a id="m01"></a>
## M01 — doktur-umair (`umair-dev`)


### Phase 0: Repository setup

#### Summary of changes
- Installed GitHub CLI (`gh` 2.103.2) via Homebrew.
- Authenticated `gh` as `umairhassaninfinite-ui` (HTTPS git protocol; `gh auth setup-git` configured as credential helper).
- Initialised git in the project root on branch `main`.
- Added `.gitignore` (OS files, node_modules, env files, build output, logs, editor folders).
- Created public repo: https://github.com/umairhassaninfinite-ui/swiftdrop
- Initial commit pushed: `AGENTS.md`, `plan.md`, `SWIFTDROP_DESIGN_DOCUMENTATION.md`, `handover.md`, `.gitignore`.

#### Issues identified
- `gh auth login` interactive prompts did not accept input via the agent; worked with stdin redirected from `/dev/null`.

#### Issues not resolved
- None.

#### Future work
- No application code exists yet; implement per `plan.md`.
- Consider adding a `README.md`, a license, and branch protection / CI once code lands.
- Public repo: never commit secrets (`.env*` is ignored except `.env.example`).

#### Notes for future phases
- Remote: `origin` -> `https://github.com/umairhassaninfinite-ui/swiftdrop.git`.
- Current working branch: `umair-dev`, tracking `origin/umair-dev` (base `main` branch preserved).
- Active GitHub CLI (`gh`) account for pushes: `doktur-umair` (configured via `gh auth git-credential`).
- Git identity: `umair` / `umairhassan.2217@gmail.com`.
- Branch protection: GitHub Ruleset "Protect main" active on `main`. Direct push, force push, and branch deletion are blocked. Changes require a PR with 0 required approvals (allowing contributors to merge their own PRs).


### Phase 1: Ten-person work distribution

### Summary of changes
- Updated `plan.md` from a five-person plan to a ten-person plan while keeping the same five A–E workstreams, product scope, requirements, and six-sprint sequence.
- Split each workstream into two numbered roles (1–10) with distinct module/page ownership, mapped sprint deliverables to those roles, and defined review pairs.
- Preserved the Design Doc as the source of product requirements; its Appendix A already contains ten suggested contribution areas.

### Issues identified
- The plan now separates shared work that previously sat with one owner, especially web administration, merchant backend, dispatch/courier backend, and platform/async work.
- Roles 5 and 6 must coordinate schema/contracts and the parcel/dispatch boundary; roles 7–10 must coordinate shared web components, routes, and mock handlers.

### Issues not resolved
- Member names and registration numbers remain TBD-team.
- The Design Doc Appendix A is still a suggested report contribution sheet and has not been edited; implementation ownership is detailed in `plan.md`.

### Future work
- Fill in member names and confirm each person's assigned role and review pair.
- Revisit sprint sizing against the actual deadline and member availability.

### Notes for future phases
- `plan.md` uses A–E for the five workstreams in requirement tables and integration maps, and roles 1–10 for individual implementation ownership.
- No application code changed in this phase; no build or test command applies. The plan should be reviewed by the team before implementation begins.

### Phase 2: Authentication-first implementation planning

### Summary of changes
- Added `docs/auth.md`, an implementation plan aligned with the Design Doc and the existing ten-person delivery plan. The existing `plan.md` content was preserved.
- Defined customer email/password and Google login, merchant dashboard and OAuth client-credentials authentication, staff provisioning, admin bootstrap and public tracking boundaries.
- Specified forms, proposed API contracts, shared types, schema additions, cookie/CSRF policy, rotating refresh families, immediate revocation, Google linking, merchant scopes, recovery and proposed privileged MFA.
- Mapped implementation phases to existing owners/Sprints 0–4, with acceptance criteria, automated checks, manual verification instructions and production gates. Security additions are labelled separately from baseline requirements.

### Issues identified
- No application code, package manifests, migrations, CI or test scripts exist yet; this phase implements documentation only.
- DD Table 4 requires verified email, but the original auth requirements do not detail its lifecycle. The conceptual schema also omits refresh/action-token storage and verification timestamps.
- The baseline pins Node.js 20, now listed as EOL by the official Node.js release page. An explicit supported-runtime decision is required before production; this phase does not silently change the stack.
- Bcrypt cost 12 is retained as required, with an explicit 72 UTF-8 byte limit and passphrase trade-off.
- Recovery, invitations, session management UI and MFA add scope beyond the original FRs and need additive issues/contracts/schema coordination.

### Issues not resolved
- Runtime ADR and dependency-version compatibility, team member assignments/deadline, production domain/TLS/proxy setup, real email sender and Google credentials remain to be configured or agreed.
- Privileged MFA policy, lost-factor identity verification, audit retention and operator recovery procedures need implementation and operational ownership before an enterprise production claim.

### Future work
- Start Phase A in `docs/auth.md`: workspace and API/web scaffold, full Design Doc schema coordination, contracts/OpenAPI/client generation, Compose, test scripts and secure configuration.
- Implement customer auth as the first vertical slice, then follow the original Sprint 2 staff/merchant and Sprint 3 Google/machine-token sequencing.
- After each implementation iteration, update this handover with actual checks and user-run manual test results; do not report the planned controls as implemented.

### Verification and manual review
- Documentation whitespace, local-link and plan-invariant checks passed. No application tests/build or browser checks apply at this stage.
- From the repository root run `git diff --check`, then open `docs/auth.md` and compare its roles (§2), phases (§9) and decisions (§12) with `plan.md` and DD §§2/9. Expected: original requirements/order preserved, added controls explicitly labelled, and no implementation claim.
- Full future setup commands, numbered runtime actions, expected results and accessibility/offline/failure checks are recorded in `docs/auth.md` §11; those commands are not yet available in this repository.

### Documentation review: Report readiness (29 October 2026)

### Summary of changes
- Added `DOCUMENTATION_AUDIT.md` covering availability and consistency of use case diagrams, architecture, process/sequence/state diagrams and justifications.
- Compared the Design Doc and delivery plan; extracted all 41 PDF pages and visually inspected the main use case, architecture, integration and workflow figures.
- Preserved the existing Design Doc, PDF and delivery-plan changes; no application code or source diagrams were edited.

### Issues identified
- Requested material exists, but the PDF and Markdown have different diagram relationships; the Markdown contains reversed extension arrows and an incorrect merchant filter node reference.
- Requirements conflict on event delivery guarantees, courier authorization responses, delivery proof, re-attempt limits, staff permissions, optional features and feature priorities.
- Booking confirmation email routing, courier capacity concurrency, webhook retry/acknowledgement behavior, persistence contracts and some security/failure branches need clarification.
- Some PDF diagram labels are clipped. Word editing instructions refer to an unavailable `.docx` source.

### Issues not resolved
- This was an audit only: findings have not been applied to the source documents or PDF.
- No application code, schema, deployment files, test results or original assignment rubric are available, so implementation accuracy and rubric completeness remain unverified.

### Future work
- Agree on the business-rule choices recorded in the audit, reconcile the Markdown/PDF from one maintained diagram source, then regenerate and inspect the report.
- Keep the modular-monolith baseline; mark Kubernetes/AI as optional and revise unsupported implementation/test claims to planned behavior.
- Review the original rubric when available and map assessed requirements to report sections and figures.

### Verification and manual review
- Deterministic checks confirmed 16 consecutively numbered Design Doc Mermaid figures, one Plan Mermaid diagram, balanced code fences, valid audit source-file links and a 41-page PDF.
- No application tests or browser automation ran; there is no executable app in this working tree.
- Open with `cd /Users/umairhassan/Desktop/ead`, then `open DOCUMENTATION_AUDIT.md` and `open SwiftDrop_Design_Report.pdf`. Follow the numbered document comparison and failure-scenario walkthrough in the audit; no application start command applies yet.

### Documentation correction: Submitted PDF against audit (29 October 2026)

### Summary of changes
- Compared all 41 pages of `/Users/umairhassan/Desktop/SwiftDrop_Design_Report (1).pdf` with every A-D finding in `DOCUMENTATION_AUDIT.md`.
- Created `output/pdf/SwiftDrop_Design_Report_Corrected.pdf` (41 pages), `docs/report/build_report.py` (maintained editable source), `docs/report/verify_report.py` (artifact validation) and `docs/report/REVIEW.md` (finding disposition, rule choices, checks and manual review).
- Retained existing successful corrections and group 23. Imported working pages 9, 27, 31 and 40 with exact text/pixel preservation. Preserved the original PDFs, historical audit, design Markdown, delivery plan and auth plan.
- Corrected remaining use-case relationships/permissions, conceptual persistence contracts, optional scope, architecture paths, booking notification routing, outbox guarantees, capacity/reassignment locking, webhook retries/acknowledgements, delivery attempts, proof privacy, realtime/offline rules, unsupported implementation/test claims and contents/figure references.

### Issues identified and resolved in the revised PDF
- Several original prose corrections were not reflected in the diagrams; confirmation routing, proof and delivery guarantees still contradicted one another.
- Courier capacity required shared row locks across different parcels, not just optimistic locking on one parcel. Webhook retries required durable progress, confirmed handoffs and new signatures on every attempt.
- Rebuilt affected vector figures and adjusted crowded sequence labels after rendering. Removed the unavailable native-Word editing promise.
- Business-rule choices: recipient name required/photo optional; three total delivery attempts; initial webhook attempt plus six retries (31.5-minute delay sum); Admin inherits Dispatcher; replay Admin-only. Details are in `docs/report/REVIEW.md`.

### Issues not resolved
- This is report correction, not an application implementation. No code/schema/deployment/test evidence or original marking rubric is available; runtime correctness, security enforcement, coverage and rubric compliance remain unverified.
- Historical `SWIFTDROP_DESIGN_DOCUMENTATION.md`, `plan.md` and `docs/auth.md` remain preserved and need reconciliation before implementation. Plan-only audit D3 remains deferred; the corrected PDF and review notes disclose that scope.
- Contribution names/registration numbers remain blank. The original input PDF remains a build dependency for the four preserved pages.

### Future work
- Reconcile source design/planning/auth requirements with the corrected report; clean up D3 without overwriting existing user changes.
- Implement concrete migrations and tests for concurrency, durability, replay, ownership, proof and privacy. Pin supported compatible dependency patches. Review the actual assignment brief when supplied.

### Verification and manual review
- Passed deterministic PDF checks: 41 nonempty pages, strict parsing, 16 figure captions, 60 correct contents links, text inside page bounds, contract/stale-claim checks, retry arithmetic and exact text/pixel preservation of the four retained pages.
- Rendered all pages for contact-sheet review and enlarged affected figures; no browser automation or application tests ran. No user manual verification is claimed.
- Setup: `cd /Users/umairhassan/Desktop/ead`; run `/Users/umairhassan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 docs/report/verify_report.py`, then `open output/pdf/SwiftDrop_Design_Report_Corrected.pdf`.
- Manual actions: (1) inspect contents links and all figures at 100%/print size, (2) compare the four preserved pages, (3) trace booking confirmation, (4) walk assignment concurrency/reassignment and webhook success/failure/restart/replay, (5) confirm proof/attempt/permission choices and compare the rubric when available. Expected outcomes and edge cases are fully listed in `docs/report/REVIEW.md`. Responsive/live-app testing is not applicable to this document-only phase.

### Documentation reconciliation: Design, delivery and authentication plans (29 October 2026)

### Summary of changes
- Reconciled `SWIFTDROP_DESIGN_DOCUMENTATION.md`, `plan.md` and `docs/auth.md` with the corrected report, preserving the modular-monolith architecture, ten numbered team roles/review pairs and Sprint 0-5 order.
- Updated Mermaid use cases, persistence/architecture/event/state/assignment/retry diagrams and associated tables/prose for the previously applied PDF rules. Corrected plan-only D3 section reference, ten-person risk wording, staged M/S frontend bundles and Sprint 1 async description.
- Updated authentication phases A-G, data/endpoint contracts, acceptance matrix and manual checks. Baseline password registration/login/booking has no mandatory email-verification gate; verification, recovery/session UI, invitations and MFA are explicit sized extensions. Google/machine tokens remain Sprint 3. Node.js 24 is the shared runtime target.
- Defined distinct human, merchant-machine and internal-service principals; event-bound lookup scopes/audiences must precede worker integration. Aligned singular merchant signup path, Admin's inherited dispatcher operations/Admin-only replay, private room membership, proof privacy and original-user/versioned offline replay.
- Updated `docs/report/REVIEW.md` and the audit's current-disposition note. Regenerated the report after replacing stale source-reconciliation statements on pages 39/41. Its four working original pages remain unchanged.

### Issues identified and addressed
- The old auth plan required verified email before booking and treated a conceptual ERD as a full ready schema; both conflicted with the corrected report. It now uses a reviewed initial migration followed by phase/extension migrations and a nonblocking verification extension.
- Worker HTTP lookups lacked the service-principal contract while the auth plan suggested platform credentials alone. It now specifies private event/job-bound HTTP scopes, audiences, token-kind denials and credential ownership/rotation.
- Frontend Must bundles silently included Should capabilities, replay appeared under Dispatcher and Helm work started before stretch criteria. Those dependencies, permissions and timing are explicit now.

### Issues not resolved / future work
- No application code, migrations, dependency pins, deployment/configuration or runtime tests exist. Implement per the reconciled plans; no application behavior/security/coverage/manual verification is claimed.
- Original assignment rubric, member identities/deadline, real provider credentials, deployment domain/TLS, operational recovery/MFA policy, retention choices and patch compatibility remain implementation/team inputs. The documents identify these rather than inventing them.
- Mermaid and PDF vector drawings use different editable formats. They share the corrected baseline, but future contract changes must update affected representations together and rerun document/PDF checks. The historical audit and earlier handover entries describe earlier states; the current-disposition note and this entry supersede their pending-documentation statements.

### Verification and manual review
- PDF validation passes: 41 nonempty pages, strict PDF parsing, 16 figure captions, 60 correct contents links, text bounds and corrected contracts, and four original pages with exact extracted text/rendered pixels. Pages 39/41 are rendered for visual inspection.
- Run `cd /Users/umairhassan/Desktop/ead`, then `git diff --check`; open `SWIFTDROP_DESIGN_DOCUMENTATION.md`, `plan.md`, `docs/auth.md` and the corrected PDF. No application setup/start command applies to this documentation phase.
- Manual actions: (1) compare DD roles/proof/retry/lifecycle contracts with plan FRs and auth boundaries, (2) compare plan Sprints 0-4 to auth phases A-G, (3) walk refresh loss, optional email outage, worker wrong audience and offline reassignment failures, (4) inspect Mermaid previews and PDF pages 39/41 at 100%. Expect identical baseline rules, no verification booking gate, correct ownership/order and explicit failure/denial outcomes. Future responsive/accessibility/offline runtime checks are documented in plan §12 and auth §11; user results remain unperformed.

- Follow-up deterministic checks passed: 17 Mermaid diagrams parsed in Node (no browser automation); semicolon sequence-label syntax errors corrected; balanced fences; 82 valid local file/anchor links; 16 ordered figures; ten team roles; six sprint headings; 45 unique FRs; corrected/stale-contract checks; `git diff --check`. Temporary parser dependencies are not application dependencies. PDF pages 39/41 were visually inspected after regeneration without clipping/overflow; runtime/manual user checks remain unperformed.


### Implementation: Phase 1 / Sprint 1 customer authentication (29 October 2026)

### Summary of changes
- Interpreted the requested phase against `docs/auth.md` Phase B / Sprint 1: implemented the customer-auth slice plus the minimum Phase A prerequisites. This does **not** mark the full Sprint 0 foundation or Sprint 1 parcel/booking/tracking/relay exit complete.
- Added pnpm workspaces, Node 24 pin, shared TypeScript/ESLint/Prettier tooling, Express API, React 18/Vite web app, loopback-only PostgreSQL/Redis Compose, validated environment, ignored key generator, health/readiness and CI definition. Existing documentation/user changes were preserved.
- Added strict shared Zod DTOs and generated OpenAPI/typed client; canonical email and Sri Lankan phone handling; bcrypt-12 passwords with Unicode/code-point and 72-byte rules and a provenance-documented local blocklist.
- Added the initial identity migration (numeric users, one role FK, five roles, account status, session families, consumed refresh hashes and access grants), additive constraints/indexes, guarded local reset/seed and bounded auth cleanup. Merchant/courier/parcel/domain tables remain later migrations; access grants currently represent humans only.
- Implemented customer-only generic registration, all-role human login, exact-900-second RS256 JWTs, current-user/grant/role/status checks, atomic refresh rotation and committed reuse revocation, logout and logout-all. No mailbox verification gate exists.
- Added anonymous and refresh-bound signed CSRF protection using `csrf-csrf`, exact Origin/Referer validation, JSON/body limits, host-only HttpOnly Strict cookies, Redis atomic HMAC-keyed throttling and fail-closed errors. No cookie fallback on bearer resource endpoints; error logging excludes raw exceptions, bodies, headers and URLs.
- Added register/login forms, role landing/route guards, loading/error/retry states, disabled Google explanation, session bootstrap, memory-only access tokens, Web Locks single-flight/cross-tab coordination and BroadcastChannel login/logout notifications. Role landing screens explicitly identify pending business functionality. Labels, field errors, focus, password reveal, duplicate-submit prevention and reduced-motion/responsive CSS are included.
- Added README setup, test/manual plan, security/rotation/cleanup boundaries; documented dependency exceptions and updated auth-plan status. Added a compiled-server smoke check after discovering/fixing Prisma CommonJS requires in the ESM bundle.

### Checks actually run
- `pnpm lint`, `pnpm typecheck`, `pnpm contracts:check`, `pnpm format:check`: passed.
- `pnpm test`: 11 backend unit and 8 frontend tests passed, including form-region axe (color contrast excluded in jsdom), validation/focus/submission/failure behavior and session transport/bootstrap.
- `pnpm test:integration`: 22 tests passed against independently provisioned PostgreSQL 17/Redis 7 Testcontainers. Covers bcrypt/hash storage, strict DTOs/body limits, canonical duplicates, CSRF/Origin/JSON, generic credential failures, IP/account throttles and forwarded-IP spoofing, all five human roles, rotation/replay/concurrent reuse, idle/absolute expiry, live status/stale roles, refresh/suspension serialization, logout/all-session revoke, shared revocation between API instances and Redis outage.
- Service/domain line coverage **94.3%** (80% gate); branch coverage 85.85%. A failed expiry fixture was corrected to respect the database idle-before-absolute constraint; rerun passed.
- `pnpm build`: web and API bundles passed. `pnpm test:built`: compiled server starts and serves health. Additional HTTP script against the compiled API checked readiness, OpenAPI, seeded customer login, refresh, logout and rejected revoked refresh without printing credentials.
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `docker compose config --quiet`: passed. Local development DB/Redis are healthy. Cleanup command ran successfully; a dedicated integration test verifies expired-grant removal, consumed-hash retention before absolute expiry and expired-family/hash deletion afterward. Prisma migration/schema diff also reports no difference, and the integration harness checks this against its fresh database.
- `pnpm audit --audit-level high`: passed, with **one moderate and two low** test/build-only advisories remaining; rationale/owners/triggers in `docs/security/dependencies.md`. React Router runtime advisories were resolved by upgrading to 7.18.5.
- Started `pnpm dev` and checked the Vite `/auth/register` HTML response and `/api/ready` proxy over HTTP. These are HTTP smoke checks, not manual UI verification. No Selenium, Playwright or browser automation was used.

### Issues identified and resolved
- The repository initially contained no executable code, so the required auth foundation was implemented before the endpoint/UI slice.
- Started the installed Docker Desktop. Existing unrelated project containers were preserved. Another project already bound Redis 6379, so SwiftDrop uses **6380**; PostgreSQL uses **5432**.
- Initial dependency metadata downloads timed out; retried from cache with a longer fetch timeout. `.npmrc` records the timeout. pnpm 11 requires explicit `allowBuilds`; required Prisma/bcrypt/esbuild/resolver builds are allowed, optional native build paths are denied.
- Corrected test-only type errors, upgraded unsupported ESLint 9 to 10, replaced CLI bundling flags with tsup configuration, and added ESM `createRequire` support needed by the bundled Prisma runtime. Removed an ineffective dynamic import. Made foreign-key delete actions explicit to match SQL, verified clean migration drift, and fixed graceful shutdown so watch restarts and compiled-server termination close cleanly. The Vite printed URL now matches the exact configured localhost Origin.

### Issues not resolved / risks
- User-run browser checks have **not** been performed: visual layout, 360px/desktop, 200% zoom, real contrast, keyboard/autofill/reduced-motion and actual two-tab Web Locks/BroadcastChannel behavior remain to verify. Axe cannot establish these in jsdom.
- Local checks used Node **24.11.1**; `.node-version` and CI pin **24.22.1**. Re-run on the pinned patch before release. Hosted CI and gitleaks have not run locally; shared-schema/contract team review is still required.
- Three documented test/build dependency advisories remain. No production security/enterprise-grade claim is made. MFA, durable audit/security mail, recovery/verification/invitations, operator admin provisioning, full authorization/resource matrix, TLS/proxy behavior, restore/rotation drills and concurrent bcrypt/load calibration remain later-phase work.
- Strict refresh reuse intentionally revokes the family after a lost response/identical-token race. Browsers without Web Locks have a documented re-login fallback; no grace bypass exists.
- A failed server logout clears this screen's token and blocks same-tab bootstrap, but the HttpOnly cookie can remain valid until retry/reload/expiry; the UI explains the failure and offers retry. Reload after an unconfirmed logout can restore that server session. Review persistent cross-reload intent in a later session-management phase if required.
- Suspension/role-change/reset writers in later phases must lock the user and revoke all families/grants in the same transaction; do not implement status changes as standalone updates. Guards already reject/revoke detected inactive/stale-role sessions. Already-committed business writes cannot be undone.
- The auth-only Compose foundation does not yet include RabbitMQ, MinIO or Mailpit; no mocks/service worker, event kernel, parcel modules, booking or tracking is claimed. Demo staff identities have no domain profiles. CI branch protection, CODEOWNERS/reviewer approval and release tags are not configured by this change.

### Manual test plan for this iteration
Setup/start from `/Users/umairhassan/Desktop/ead` (skip copying an existing `.env` or generating existing keys):

```sh
cp -n .env.example .env
pnpm install --frozen-lockfile
pnpm auth:keys:generate
pnpm db:generate
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

1. Open `http://localhost:5173/auth/register`. Submit empty/invalid/mismatched/over-72-byte data, then a valid unique customer. Expect linked errors/first-field focus, one pending submission and generic acceptance. Log in at `/auth/login`; expect own `/account` profile without email verification.
2. Reload `/account` in two tabs; expect loading then restored sessions. Check session; sign out in one tab and expect private content cleared in both. In two browser profiles, sign out everywhere and expect old sessions to fail on their next protected request.
3. Log in with each seeded role (README credentials). Expect role-specific landing routes, correct guards, pending-feature copy and disabled Google explanation. Inspect storage/cookie attributes without copying token values.
4. Try five invalid logins, offline mode and `docker compose stop redis` / `docker compose start redis` (similarly PostgreSQL). Expect 429/wait, retryable failures, restored controls, preserved non-secret inputs and an explicit unconfirmed-logout retry. Restore services/network before continuing.
5. Repeat at 360px/desktop, 200% zoom, keyboard-only, password-manager paste/autofill and reduced motion. Expect no essential action hidden, visible focus, readable errors and no horizontal overflow. Full expected cases and failure-state detail are in README's manual test plan; record actual browser/device/results here.

### Future work / next phase
- Finish the separately owned Sprint 1 parcel/quote/booking/history/public-tracking and outbox/relay/logging slice to meet the original walking-skeleton exit; connect these to `authenticate`/`requireRole` without a verification gate.
- Review identity/schema/contracts with the documented owners; use additive migrations for merchant/courier/domain and later auth extensions. Provision machine/service principals separately, never as human roles.
- Size Phase C security extensions separately; follow Phase D for staff/merchant administration and operator bootstrap, Phase E for Google/machine tokens, and Phase F/G for MFA/production gates and full hardening.
- Schedule bounded `pnpm auth:cleanup` batches, update the pinned runtime locally, run hosted CI/secret scanning, follow dependency upstream fixes, and complete the manual verification record.

### Planning: Email verification and Google sign-in sprint (29 October 2026)

### Summary of changes
- Added `docs/auth-sprint-plan.md` for the requested auth work: verification/resend, Google OIDC, restricted profile completion and explicit customer linking, with dependencies, role ownership, estimates, sprint sequencing, acceptance criteria and testing instructions.
- Preserved the original schedule: verification/resend remains a Sprint 1–2 security extension and Google OAuth remains Sprint 3. This planning file does not mark original sprint exits complete.
- Preserved the documented nonblocking email-verification policy. Mandatory verification would require an explicit product/contract change before implementation.

### Issues identified / unresolved
- Current schema/contracts lack verification/provider metadata, action tokens, OAuth transactions and restricted profile state; Compose has no Mailpit. The backlog accounts for these prerequisites and existing-account compatibility.
- Live Google acceptance needs private development client configuration. Actual team availability and member assignments are unknown; the 14–19.5 person-day estimate assumes four active contributors plus review and may need multiple sprints.
- Recovery, Google-only password setup, MFA, merchant machine access and production durable mail remain future work under the existing auth plan.

### Sprint 2 implementation checkpoint (29 October 2026)

### Summary of changes
- Added an additive `email_verified_at` migration and hashed, expiring verification-token storage. Existing users remain unverified; no password/session records are rewritten.
- Registration sends a 24-hour confirmation link through bounded SMTP delivery. Mail failure keeps the account and token, and password login remains available. Resend has generic copy, IP limiting, per-account cooldown, and invalidates prior live tokens. Confirmation is an explicit same-origin POST, single-use, and checks current account status.
- Added loopback-only Mailpit to Compose, auth-mail timeout settings, verification status on public user/session responses, UI confirmation/resend flows, and bounded expired-token cleanup.
- Added an integration case for token hashing, available unverified login, explicit confirmation and replay rejection.

### Issues identified / unresolved
- Sprint 2 delivered behavior uses SMTP directly and synchronous local sending. It does not guarantee delivery after process failure; production needs a durable mail/outbox worker and secret-managed relay settings.
- Integration verification covers issuance, hashed storage, successful confirmation, replay, resend invalidation, expiry, SMTP failure recovery and concurrent confirmation. The resend cooldown is enforced by the generation timestamp and remains worth checking in the live Mailpit acceptance pass.
- The dependency change includes `openid-client` in preparation for Sprint 3; no Google provider flow is enabled yet at this checkpoint.

### Future work / manual verification
Run `cp -n .env.example .env`, `pnpm install --frozen-lockfile`, `pnpm db:generate`, `docker compose up -d --wait`, `pnpm db:migrate`, and `pnpm dev` from the repo root. Register at `http://localhost:5173/auth/register`, inspect the captured message at `http://localhost:8025`, click its link and explicitly confirm. Check the token fragment disappears before submission; status changes on `/account`; replay/expired links show a safe error; resend works; and an unverified account still signs in. Repeat on mobile width, keyboard-only and reduced-motion settings. User-run browser checks have not been performed.

### Sprint 3 implementation checkpoint (29 October 2026)

### Summary of changes
- Added nullable Google subject/profile fields and OAuth transaction storage with ten-minute expiry, one-time consumption, browser binding, hashed state, nonce, and AES-GCM-encrypted PKCE verifier. Added DB checks so incomplete profiles can only belong to passwordless Google customers.
- Added server-side Google availability, authorization start/callback, verified-ID-token identity handling through `openid-client`, customer creation by stable `sub`, safe email-collision behavior, restricted profile completion, and explicit linking after current-password proof. Linking checks the same verified email, current account/session/password state, and unique provider ownership. Existing password account ID, role and password hash are preserved.
- Added `/auth/complete-profile`, `/auth/google/result`, and `/settings/security` screens; enabled the Google button only when provider availability reports configured. Incomplete profiles are redirected to completion, and an exported server guard is available for business routers.
- Added OAuth secret generation that preserves older generated keys, bounded expired OAuth transaction cleanup, generated API contracts, and local setup documentation.
- Automated integration uses a deterministic provider fake for callback/session/account/link mechanics. OIDC adapter-level protocol checks were completed in the next customer increment; that work also enabled the explicit signature-validation hook required by `openid-client` 6.8.8.

### Issues identified / unresolved
- A private Google web client is not configured in this workspace, so the button stays unavailable and a real Google consent flow has not been exercised. Authorized callback must exactly be `http://localhost:5173/api/v1/auth/google/callback` for the current local Vite origin.
- Automated callback tests use a fake OIDC adapter; they do not exercise Google's live discovery/token endpoints. Live Google acceptance still requires private development credentials.
- Incomplete-profile and unverified-customer booking policy is now exercised against resource routes. Apply the incomplete-profile guard to every future business router after authentication/role checks.
- The current auth module has no durable audit system. Linking writes identity atomically but does not create a separate audit record. Local SMTP is synchronous and remains non-durable; production mail, audit, key management and HTTPS deployment are outstanding.

### Manual test plan / future work
Setup: from `/Users/umairhassan/Desktop/ead`, run `cp -n .env.example .env`, `pnpm install --frozen-lockfile`, `pnpm auth:keys:generate`, `pnpm db:generate`, `docker compose up -d --wait`, `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev`. To test Google, enter the private client ID/secret and exact callback URL into `.env`, restart the API, and use an OAuth Web client registered for that URI.

1. At `/auth/login`, verify the button is disabled when Google credentials are absent. With credentials, start Google sign-in using a new customer; expect a clean same-origin return and redirect to `/auth/complete-profile` when phone is absent.
2. Submit invalid name/phone and then a valid profile. Expect inline errors, first-invalid focus, completion, account reload and sign-out. Use a direct bearer request to any future business route and confirm it enforces profile completion server-side.
3. Try a Google identity whose email already belongs to a password account. Expect no duplicate account and a prompt to sign in with password. From `/settings/security`, use wrong then correct current password; expect only correct proof to initiate linking. Complete Google consent and confirm the original user ID, role and password hash are unchanged.
4. Exercise provider cancel/outage, callback from a second browser, expired/replayed state, suspended account, changed password/session during link, and subject/email collision. Expect safe retry/error results and no privilege change. Repeat at 360px and desktop, keyboard-only, 200% zoom and reduced motion.

Automated checks are run during final integration. No live-provider, responsive-browser or manual acceptance is claimed until the user records those results here.

### Automated check results
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm contracts:check`, `pnpm build`, `pnpm test:built`, and `pnpm format:check` pass after implementation. Unit suites: 14 API and 8 web tests; integration: 28 tests.
- Integration coverage reports 85% line coverage overall and 85% for the auth service; no live Google/provider checks are included.

### Verification and manual review
- Checked the plan against current source/configuration and documented boundaries. Passed `git diff --check` and focused checks for balanced Markdown fences, valid local links, eight backlog items, scope and handover presence. No runtime checks or browser verification are claimed for this documentation-only iteration.
- The auth implementation plan was used during delivery and removed after its remaining automated protocol work moved into the completed customer increment. Its live-provider/manual checks remain in README and this handover.

### Future work
- Record live Google and browser acceptance when credentials and a manual test pass are available. Production mail, audit, key management and HTTPS deployment remain outstanding.

### Planning: Next customer booking and tracking sprint (29 October 2026)

### Summary of changes
- Added the customer booking/tracking implementation checklist for the incomplete original Sprint 0/1 walking skeleton, with ten sized backlog items, existing role/reviewer ownership, dependencies, daily checkpoints, acceptance criteria and exact proposed runtime/manual checks. It has now been completed and removed; acceptance steps moved into README and this handover.
- Prioritized pricing/quotes, atomic customer booking/idempotency/history/outbox, private customer reads, public tracking, Admin zones/pricing and RabbitMQ relay/logging. Carried OIDC adapter-level failure tests and business-route profile guards into the plan.
- Corrected the stale top-level `plan.md` status while preserving its original six-sprint roadmap and unrelated workspace changes. No application implementation or external issues were created.

### Issues identified
- Auth-only checkpoint names do not establish product-wide Sprint 2/3 completion. Domain schema, business routes, broker/relay and booking/tracking screens are absent.
- The previous final “Implement AUTH-01–08” instruction is stale relative to delivered auth checkpoints; current carryover is specific protocol/live-provider acceptance and production gaps, not wholesale auth reimplementation.
- Capacity, member names and dates are unconfirmed; 25–32 person-days is a forecast assuming ten roles and 35 usable person-days. C1/A2 dependencies require early checkpoints.

### Issues not resolved / future work
- All ten customer booking/tracking sprint items are implemented locally and recorded below. Broker delivery still needs a live manual outage/recovery check.
- Live Google credentials/browser acceptance, production mail/audit/TLS/key/recovery gates, runtime patch alignment and hosted CI/secrets-scan evidence remain open as recorded above. Refresh dependency evidence at implementation time.
- Later operations, staff/merchant, notifications/realtime, receipts/offline and other roadmap work remain outside this customer increment; partial FR slices are explicitly labelled in the plan.

### Verification and manual review
- Reviewed current implementation/configuration and reconciled the proposed scope with the design and delivery roadmap. The customer booking/tracking implementation followed this sequence.
- Passed `git diff --check` and a focused deterministic check of balanced Markdown fences, ten complete/unique backlog rows, referenced local file existence and this handover checkpoint. Backend support assignments are proposed and require Day 1 owner agreement; otherwise the plan explicitly reduces scope to schema/pricing/quotes.
- Exact setup/start commands and runtime acceptance actions now live in README and the completed customer increment entry below.

### Work distribution re-division: vertical delivery slices (29 October 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** user request to re-divide the ten-member work distribution by deliverable · **Reference:** uncommitted (planned only; documentation change, not implemented, reviewed by other members or merged).

### Summary of changes
- [plan.md §4](plan.md#4-team-structure-and-ownership) now divides work into ten **vertical delivery slices**, one per member. Each slice includes its own Prisma tables/migrations, contracts, backend module, UI screens (including admin/staff screens mounted inside another console), MSW handlers, tests and docs. New subsections: §4.1 slices, §4.2 complexity balance (every member ≈ 20 relative units across DB/backend/frontend/quality), §4.3 requirement ownership map, §4.4 silent work, §4.5 independent-start table, §4.6 legacy A–E crosswalk, §4.7 module map.
- Silent work (folder structure, CI/CD, Compose/Docker, Kubernetes/Helm, lint presets, repository automation) is excluded from the balance. M01 is steward because the repository, Compose and CI foundation already exist from M01's earlier work; every member adds entries for their own services.
- Rewrote plan §6 layout/hotspots, §7.4–7.5 labels and migration ownership, §8 workflows, §9 Sprint 0–5 per member, §10 contracts (IDs X-01–X-14), §12.1 owners, §13 risks and §15. Review pairs are now M01↔M02, M03↔M04, M05↔M06, M07↔M10, M08↔M09.
- [AGENTS.md](AGENTS.md): registry column now names each member's delivery slice; added "Work distribution principles", including the rule that a member's handover parts may not match their slice in `plan.md` and that is acceptable.
- [docs/auth.md](docs/auth.md): added one ownership note pointing at the §4.6 crosswalk; its legacy role letters are otherwise unchanged.
- The earlier "Phase 1: Ten-person work distribution" entry above is preserved as history and is superseded by this checkpoint for ownership.

### Issues identified
- Delivered local code is not split by slice: pricing, booking, tracking and event code share `apps/core-api/src/modules/parcels` and `apps/web/src/features/parcels`, and relay/consumer work sits outside the planned M08 service layout (see C-02).
- Several screens span slices by design (FR-F3/F4/F5/F8). Ownership of each part is in plan §4.3; the console shells in M10 only compose feature routes.
- Complexity units are relative planning estimates, not measured effort; completed baseline work is not subtracted.

### Issues not resolved / future work
- Member names and branch mappings for M02–M10 are still unassigned; the slice-to-person assignment is a planning default until the user registers members.
- Split the combined delivered code to slice owners with no-behaviour-change refactor PRs (C-02), create per-slice `.prisma`/contract files, and add CODEOWNERS and `slice:` labels when the repository settings are configured.
- `docs/auth.md` still contains legacy role letters inside its phase tables; update them only when each phase is next edited.
- No dependency in the register below has been integrated or verified against another member's branch.

### Verification
- Documentation-only change: runtime, build and browser checks are **not applicable** and not claimed.
- Deterministic checks run: a scripted consistency check of `plan.md` (all 45 functional-requirement IDs have an owner in §4.3; ten slice rows, ten complexity rows each summing to 20 for a total of 200, ten independent-start rows; Sprint 0–3 tables list all ten members; no stale layer-role owner references outside the crosswalk; Mermaid node references declared; balanced code fences) and `git diff --check` on the edited files. Sprint 4–5 are bullet lists by design. The script is a scratch check and is not committed.
- Not checked: rendering of the Mermaid diagram, other members' views of the split, and the PDF report (not edited; it still describes the ten-role plan).

### Manual test plan (documentation review)
Setup: no commands needed; open `/Users/umairhassan/Desktop/ead/plan.md` in a Markdown preview.

1. Open §4.1. Expect ten rows; each row lists data, backend and UI locations for one deliverable (for example M01 lists `modules/{auth,users}` and `features/{auth,users}`).
2. Open §4.2. Expect every member total to be 20 and no member to be frontend-only or backend-only.
3. Pick any requirement in §2 (try FR-F5 and FR-I5) and find it in §4.3. Expect an owner, and for FR-F5/F8 an explicit split by screen.
4. Read §4.5. Expect each member to have something they can build and test on Day 1 without waiting (fakes or MSW named).
5. Open §9 Sprint 1. Expect the walking-skeleton goal unchanged and all ten members present.
6. Open [AGENTS.md](AGENTS.md) "Work distribution principles". Expect the explicit statement that handover parts may differ from `plan.md` slices.
7. Click the crosswalk link in [docs/auth.md](docs/auth.md). Expect it to open plan §4.6.
8. Edge cases: anchors may differ between Markdown previewers (`#46-legacy-ae-crosswalk`); the §4.7 diagram needs a Mermaid-capable preview; check that no member is silently assigned silent work other than the M01 steward note.

### Cross-member dependencies
Produced by M01 for others: `authenticate/requireRole` and service-JWT verifier contract (X-02, X-03); steward review of silent work (X-14). Consumed by M01: kernel from M10 (X-01), worker-lookup requirements from M08/M09 (X-03). Status: planned; see the register in [Shared integration](#shared-integration). Counterparts: [M08](#m08), [M09](#m09), [M10](#m10).

### Planning: M01 remaining sprints and first-sprint implementation plan (30 October 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** divide remaining M01 work into detailed sprints, keep `m01.md` local, and plan Sprint 1 · **Reference:** uncommitted; inspected source revision `7a348f8`. Planning only; application behavior is unchanged and nothing is marked implemented, reviewed by other members or merged.

#### Summary and durable planning decisions

- Created the intentionally ignored root `m01.md` and added the exact root rule `/m01.md` to `.gitignore`. It is a local working plan; `plan.md` remains the shared ownership authority and this checkpoint retains decisions needed by other contributors without requiring the ignored file.
- Defined five **local M01** sprints, distinct from the repository's Sprint 0–5 numbering: (1) staff provisioning/invitations and Admin users UI, estimated 6–8 focused engineering days; (2) atomic suspension/reactivation, Admin safeguards and operator bootstrap, 5–7 days; (3) service identities/X-03, 4–6 days; (4) auth hardening and live/manual acceptance, 4–6 days; (5) integration/handoff and infrastructure stewardship, 3–5 days. Estimates exclude external review, blocked integration and separately sized security extensions; no deadline or team availability was supplied.
- Local Sprint 1 plans strict Admin-only staff creation/listing, hashed 24-hour single-use invitations, resend/revoke, explicit private-password acceptance, bounded cleanup, generated contracts/client, Mailpit delivery with honest failure feedback, role/token/concurrency checks, accessible users/invitation screens and manual acceptance. These are proposed additions, not existing endpoints. FR-A5 is partial after provisioning and completes only with Sprint 2 suspension.
- Proposed endpoint additions: `GET/POST /api/v1/admin/users`, `POST /api/v1/admin/users/{id}/invitation` with explicit resend/revoke action, and `POST /api/v1/auth/accept-invite`. User creation is limited to `COURIER`/`DISPATCHER`; existing identities are never silently converted. Admins do not choose staff passwords. Invitation acceptance activates/sets password/verifies mailbox atomically and then requires ordinary login. Shared DTO/schema review is required before dependent implementation.
- Reuse current auth guards, CSRF/origin/JSON protections, password helpers, session provider, typed transport, mail adapter and test harness. Synchronous SMTP is a local/demo delivery adapter, not guaranteed delivery; persist before sending and support bounded explicit resend. Recovery, MFA, durable security mail and audit remain separately sized production gates.

#### Dependencies, overlaps and future work

- Produces X-02 user-administration behavior and planned X-03 worker verifier; consumes [M10](#m10) composition/schema review under X-01/X-13. [M02](#m02) is the review pair for human/machine identity boundaries. No review approval is claimed.
- Added proposed X-15 and C-04 for [M06](#m06) courier profile/readiness. Dispatcher onboarding remains independently demoable; courier activation is blocked until required fields, owning writer and atomicity are agreed and implemented. Inviting a courier alone does not establish usable courier onboarding.
- Recorded C-03: current single Prisma file and `res.locals.user` implementation differ from the planned per-domain files/`req.user` wording. Choose the schema path and reconcile the middleware contract before dependent code. No broad schema refactor is implied by this planning task.
- C-02 remains open; any pricing/booking/tracking/relay split requires receiving-owner coordination. M01 stewardship reviews each member's infrastructure entries; other slices are not added to M01 implementation scope. Helm remains separately estimated stretch work after baseline acceptance.
- Evidence boundary: only the local `umair-dev` working tree and named source/documents were inspected. M02–M10 branches, remote repository settings, hosted CI, live Google and browser acceptance were not checked. Next implementation work is Sprint 1 contract/schema review; this planning request does not start application development.

#### Verification and manual documentation review

- Passed `git diff --check` and focused structural checks: five sequential local sprint sections with Sprint 1 detail, balanced Markdown fences, ten permanent member sections/anchors, previous M01 history preserved verbatim, and other member histories unchanged. `git check-ignore -v m01.md` confirms the root ignore rule; `git ls-files -- m01.md` confirms the plan is untracked. Runtime/build/browser checks are not applicable to this documentation/ignore-only iteration; Markdown preview rendering was not checked. No previous runtime results are re-attributed to this work.
- Setup/review commands from `/Users/umairhassan/Desktop/ead`: `git diff -- .gitignore handover.md`, `git check-ignore -v m01.md`, `git ls-files -- m01.md`, `git diff --check`. No server is needed.
1. Open local `m01.md` in a Markdown preview. Expect five sequential local sprints with outcomes, estimates, scope, dependencies, tests, manual acceptance and exit criteria; no claim that repository Sprint 2/3 is being restarted.
2. Read Sprint 1. Expect actual current files/helpers, proposed endpoints, transaction/token/mail rules, ordered work packages, exact post-implementation setup/check commands, dispatcher demo and explicit courier readiness blocker. Runtime routes are future targets, not available from this documentation change.
3. Review `.gitignore` output. Expect `/m01.md` matches the local plan; `git ls-files -- m01.md` prints nothing. `git diff -- .gitignore handover.md` should contain only the exact ignore addition and this shared/M01 planning record. Other contributors can recover shared decisions here without the ignored plan.
4. Edge/failure review: no other member history is rewritten; C-02 remains open; X-15/C-03/C-04 stay unagreed/open; no secrets, runtime verification, integration or production-readiness claims appear. Responsive/runtime acceptance is not applicable until the corresponding screens exist; the local plan supplies the future numbered test cases.

### Implementation: M01 Sprint 1 staff invitations (30 October 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** implement local M01 Sprint 1 staff provisioning/invitations and Admin users UI · **Reference:** uncommitted; base revision `7a348f8`. Implemented locally; not reviewed by another member and not merged.

#### Summary and touched modules

- Added strict shared DTOs and generated OpenAPI/client paths for bounded staff list/filter, staff invitation creation, resend/revoke and acceptance. Added a `StaffInvitation` model and additive `202610300001_staff_invitations` migration to current `packages/db/prisma/schema.prisma`; existing migrations were not edited.
- Added `modules/users` for Admin-only staff list/create/invitation actions and explicit acceptance. New users are limited to COURIER/DISPATCHER and start `INVITED` with no password. Tokens are random 32-byte values, stored only as SHA-256 hashes, expire in 24 hours and are consumed once. Dispatcher acceptance atomically sets bcrypt-12 password, verifies mailbox ownership and activates the user; normal login remains a separate step.
- Added post-commit SMTP invitation delivery, truthful sent/failed/not-sent status, a one-minute resend cooldown and bounded expired-invitation cleanup. Mail delivery failure retains the invited account for explicit retry. No raw invitation token is returned in API responses.
- Added Admin list/filter/pagination/create/resend/revoke screens, `/auth/accept-invite` password UI, URL-fragment removal, password confirmation, accessible loading/error/empty notices and responsive horizontal table scrolling. Updated auth docs and the ignored local `m01.md` implementation status.
- Courier records can be invited, but acceptance returns setup-pending and leaves the invitation/user unchanged until M06 defines profile readiness. C-03 remains open: the additive table and generated client use current shared files and still need M10 schema/contract review. See [X-15/C-04](#shared-integration) and [M06](#m06). No other member branch or PR was inspected.

#### Issues and next work

- **C-03 open:** current single Prisma schema path was used for a local, tested additive migration; M10 review and the shared schema-path/interface decision remain required before merge/integration.
- **C-04/X-15 open:** courier acceptance remains safely blocked; M06 must agree required profile fields, owning writer and atomic activation before this path can be completed.
- M01 Sprint 2 suspension/reactivation and operator admin bootstrap, Sprint 3 worker identity, live browser/Mailpit acceptance and cross-branch review remain future work. SMTP handoff is not guaranteed mailbox delivery; recovery, MFA, audit trail and durable mail are not included.

#### Automated verification

- Passed `pnpm db:generate`, `pnpm contracts:generate`, `pnpm contracts:check`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm test:built`, and `git diff --check` on this working tree. API/web unit suites: 24/24 and 13/13; migration-backed API integration suite: 33/33. Integration deploys migrations to disposable PostgreSQL and checks Prisma migration drift. Reported aggregate integration coverage: 83.7% statements, 78.94% branches, 84.98% lines.
- No live browser, Mailpit UI, responsive-device/zoom/keyboard pass, Google flow, other member branch, hosted CI, or merged-main verification was performed. Tests prove dispatcher API setup/acceptance and courier setup blocking; they do not prove email reaches a mailbox or the UI is manually accepted.

#### Setup and manual acceptance (not yet run by a human)

From `/Users/umairhassan/Desktop/ead`, use Node 24 and pnpm 11, with Docker running:

```sh
cp -n .env.example .env
pnpm install --frozen-lockfile
pnpm auth:keys:generate # initial setup only; preserve existing keys
pnpm db:generate
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed # disposable local database only
pnpm dev
```

1. Sign in at `http://localhost:5173/auth/login` with the README's seeded admin credentials and open `/admin/users`. Expect staff-only rows, role/status filters, bounded pagination and a labelled invite action. Check empty/error/retry states and narrow 360px and desktop widths.
2. Open `/admin/users/new`; submit invalid/empty fields, then create a unique dispatcher. Expect validation and no duplicate submit; a successful result is `INVITED` with truthful delivery state. Open `http://localhost:8025`, follow the email link, and expect the token fragment to disappear without activation on GET.
3. Set a valid private password and confirm it. Expect `ACTIVE`/verified state, then sign in through `/auth/login`; acceptance alone must not create a session. Retry the old token and expect a safe rejection.
4. After the resend cooldown, resend an invitation and try both email links: only the newest link should work. Revoke another invitation after confirmation and verify its link fails. Stop Mailpit/SMTP and create a separate invite; expect the invited user remains and Admin sees a retry instruction.
5. Invite a courier before M06 readiness is agreed; submit its link and expect setup-pending, no activation and no token consumption. Check anonymous/Dispatcher access is denied by the API, CSRF/Origin failures are rejected, and keyboard focus/status announcements remain usable at 200% zoom/reduced motion.

<a id="report-submission-format-2026-10-31"></a>
### Documentation: Report submission format (31 October 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** prepare the existing PDF for submission with monochrome formatting, Appendix B removed, formal report language and the repository URL on the cover · **Reference:** uncommitted; base revision `a06a2d5`. Delivered locally; not merged.

#### Summary and files

- Updated `output/pdf/SwiftDrop_Design_Report_Corrected.pdf` and its maintained source, `docs/report/build_report.py`. All 40 pages, including imported diagrams, use grayscale. The cover includes the clickable recorded project URL, `https://github.com/umairhassaninfinite-ui/swiftdrop`, and the date 31 October 2026.
- Removed Appendix B, its contents/outline entries, correction/audit explanations, missing-evidence disclaimers and editing instructions. Technical limitations remain expressed as design behavior rather than review commentary. Appendix A retains its ten contribution rows with consistent typography; member names and registration numbers remain blank because they were not supplied.
- Updated `docs/report/verify_report.py` to check the requested artifact format, layout and navigation. The generator now imports the three retained original pages (9, 27, 31) from the repository's `SwiftDrop_Design_Report.pdf`, replacing the unavailable external Desktop source path. Historical 41-page/four-page pixel-preservation checks are superseded by this checkpoint; original PDFs remain preserved.
- No new cross-member contract or ownership decision was needed; see the [shared integration checkpoint](#shared-integration). No codebase comparison, implementation change or application test was requested or performed.

#### Checks and remaining work

- Passed the report generator and deterministic artifact verifier: 40 nonempty pages, strict PDF parsing, monochrome rendering on every page, 16 figure captions, 59 correct contents links, clickable cover repository link, text within page boundaries, Appendix B/editorial phrases absent, retained text on the three imported pages, and Appendix A present.
- Rendered every page and inspected all five contact sheets, plus full-page cover, dense tables, architecture, sequence/activity diagrams, testing, conclusion and contribution sheet. Source/document whitespace checks pass. Git treats this PDF as text for whitespace checks; the PDF is validated with its parser/rendering checks instead.
- Security/accessibility review of the report changes: the new external link contains only the public repository URL; selectable text and document links are retained, with dark text and monochrome table/diagram contrast. No application, browser automation, runtime, responsive UI or cross-branch checks apply to this document-format task. User-led PDF review has not been performed.
- Remaining submission input: the team must complete Appendix A's member names and registration numbers. No contributor identities were invented. Application integration blockers remain as recorded in Shared integration.

#### Setup and manual review (for the user)

No application start is needed. From the repository root:

```sh
cd /Users/umairhassan/Desktop/ead
/Users/umairhassan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 docs/report/build_report.py
/Users/umairhassan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 docs/report/verify_report.py
open output/pdf/SwiftDrop_Design_Report_Corrected.pdf
```

1. Open the cover and select the repository URL. Expect the printed URL above and navigation to that GitHub repository; network/access availability is outside the PDF check.
2. Inspect the contents and select the conclusion and Appendix A. Expect pages 39 and 40, no Appendix B, and no editing/review notes. Search for the three quoted review passages from the request; expect no results.
3. Inspect diagrams and tables at 100% and in print preview. Expect monochrome text, fills and graphics, legible labels, visible table boundaries and no clipped content; inspect dense pages 14, 17, 24, 30, 35-37 in particular. Fit-to-width and zoom are viewer checks; responsive application states are not applicable.
4. Complete/review the member details in Appendix A before submission. Expect ten contribution rows and no fabricated names or registration numbers. Preserve the source PDF and regenerate through the maintained report source when entering these details.

### README local login and email setup clarification (1 November 2026)

- **Member/branch/task:** M01, `umair-dev`; clarify the existing README startup and local login/email-verification steps. Commit/PR: uncommitted.
- **Summary/files:** Added explicit Nodemailer SMTP → Mailpit behavior, the local inbox URL, and the steps to register a unique customer and verify it. Clarified that captured local mail is not delivered to a real mailbox and that verification is optional. Updated the M01 status index.
- **Issues/future work:** No implementation issue identified. Users who want delivery to an external mailbox must configure an approved SMTP relay; production mail setup remains outside this local-development guide.
- **Automated checks:** `git diff --check -- README.md handover.md` passed. Application tests/runtime checks: not applicable to this documentation-only change. README command targets were cross-checked against `package.json`, `.env.example`, Compose, and auth configuration.
- **Setup/start commands:** From a fresh checkout, follow the README “Start locally” commands: `cp -n .env.example .env`, `pnpm install --frozen-lockfile`, `pnpm auth:keys:generate`, `pnpm db:generate`, `docker compose up -d --wait`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev` (key generation is first-setup only).
- **Manual review plan (not performed by the agent):** (1) Open `http://localhost:5173/auth/register`, create a new customer with a unique email; expect registration acceptance. (2) Open `http://localhost:8025`; expect a verification message routed through local SMTP to Mailpit. (3) Follow its link; expect verified status, then retry the link and expect safe rejection. (4) Before verification, sign in; expect access to work because verification is optional. Repeat the auth flow at 360px and desktop, keyboard-only and reduced motion; if the API or Mailpit is stopped, expect a clear retryable UI result and no false delivery claim.

<a id="agents-local-only-2026-11-02"></a>
### Keep agent instructions local (2 November 2026)

- **Member/branch/task:** M01 — doktur-umair, `umair-dev`; remove `AGENTS.md` from GitHub while retaining the local file. Reference: accompanying `chore(docs): keep agent instructions local` commit; removal from `main` pending reviewed PR.
- **Summary/files:** Removed the root `AGENTS.md` from the Git index with `git rm --cached`; added `/AGENTS.md` to `.gitignore`; removed the active shared-integration link to the now-local file. Local contents are preserved byte-for-byte. Earlier historical entries remain unchanged. See the [shared checkpoint](#shared-integration).
- **Checks/review:** Verified the local file exists with the same SHA-256 hash, is absent from the index, and matches `.gitignore`; scoped staged whitespace checks passed. No runtime, security-sensitive application logic, accessibility or UI changes; application tests are not applicable. Unrelated README/report and earlier handover changes are excluded from this commit.
- **Limitations/future work:** This removes the file from the updated branch tip, not earlier commits or other branches. Other contributors must preserve any local copy before pulling the deletion; Git may remove their previously tracked copy. Existing integration blockers and member ownership remain unchanged.
- **Setup/manual verification:** No application start is needed. Run `cd /Users/umairhassan/Desktop/ead`.
  1. Run `test -f AGENTS.md && echo "Local file exists"`; expect the message and the original local contents.
  2. Run `git ls-files -- AGENTS.md` and `git check-ignore -v -- AGENTS.md`; expect no tracked path and the `/AGENTS.md` ignore rule respectively. After editing the local file, `git status --short -- AGENTS.md` should remain empty; do not force-add it.
  3. Open the updated GitHub branch after push; expect no root `AGENTS.md`. Check `main` after PR merge for the same result. Historical commits can still contain the file. Responsive/offline/permission UI states are not applicable.

<a id="m01-sprint2-2026-11-06"></a>
### Implementation: M01 Sprint 2 account administration and operator setup (6 November 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** implement approved all-role suspension/reactivation and hidden-password operator admin creation · **Reference:** uncommitted on `f6adc50`. Implemented and locally tested; no peer review, user-run acceptance or Sprint 2 merge is claimed.

#### Summary and contracts

- Added separate `adminUserSchema`/`adminUsersPageSchema` with all five roles and nullable name/phone. `GET /api/v1/admin/users` now lists every human role with existing bounded filters/cursor pagination. Added strict `PATCH /api/v1/admin/users/{id}/status` input `{ status: "ACTIVE" | "SUSPENDED" }`, returning a safe Admin summary. Staff creation/invitation response shapes remain unchanged. Generated OpenAPI/client precede dependent code in this working iteration; user approved the plan, but consumer/peer approval under plan §7.6 remains pending (C-05).
- Implemented `ACTIVE ↔ SUSPENDED`, self-suspension and final-active-admin safeguards, invited-account rejection and same-status no-op. Reactivation requires an existing password hash or supported customer Google identity. Status changes and operator creation share PostgreSQL transaction advisory lock `(1396982864, 1)` before ascending actor/target user locks. Recheck actor status/role, original session family and access grant under lock for status/create/invitation mutations. Suspension/reactivation atomically revoke all families, delete grants and invalidate outstanding account-bound verification/invitation/OAuth actions; consumed refresh hashes remain for replay protection. Google callbacks now acquire the bound user before the OAuth action to avoid an inverted lock order. Previously committed business operations cannot be undone.
- Extended `/admin/users` to all-role filters, incomplete-profile placeholders, status badges, native target confirmation, duplicate-submit prevention, status/error feedback, conflict reload and empty-page reconciliation. Authenticated reads refresh/retry at most once; mutations never replay automatically. Terminal 401 refresh failure clears memory/private views in the same tab and broadcasts sign-out across tabs. Shared auth transport changes cover existing protected callers without changing their domain contracts.
- Added `pnpm admin:create`: interactive TTY-only name/email/phone/password/confirmation, hidden secret entry, existing registration validation and bcrypt-12, minimal database-only configuration and safe errors. Creates an active Admin without a session/email-verification claim; existing active Admin is an unchanged no-op; other existing roles/states conflict. No role conversion/reset/unsuspension. Concurrent creates serialize, cancellation before commit rolls back, and terminal mode is restored. No schema migration or dependency was added.
- Touched identity/user API modules and transaction helper, operator CLI/prompt, auth/users web features/nav/styles, contracts/generated artifacts, test suites/coverage configuration, root/API scripts, README and auth documentation. Existing README additions and report/PDF edits were preserved. No courier/merchant operational state or other member history was changed.

#### Issues, dependencies and remaining work

- Current-view correction: invitation implementation is commit `67a77de`, present in cached `origin/main` (`2eb332d`) and cached `origin/umair-dev`/`doktur/umair-dev`. Earlier checkpoints saying uncommitted/unmerged describe their original date and remain intact. Cached ancestry does not establish live remote or integrated runtime readiness.
- [X-02/C-03/C-05](#shared-integration): M01 produces all-role list/status contracts, live transactional Admin authorization and documented `res.locals.user`/`authFamilyId`/`authGrantId`. [M10](#m10) consumes/reviews shared schema/interface and web transport composition. No M10 branch/review is available; review remains open, and the existing single Prisma path was retained unchanged.
- [X-15/C-04](#shared-integration): [M06](#m06) must provide the agreed courier profile/atomic readiness contract before invitation activation. Identity suspension intentionally does not reassign parcels or change capacity. Full FR-A5 completion remains blocked by courier activation even though suspension is implemented.
- Next: agree and implement X-03 worker identity with [M08](#m08)/[M09](#m09) and M02 boundary review; run browser/Google acceptance and identity hardening; integrate only after required review. C-02 ownership handoffs, production recovery/MFA/audit/durable mail and deployment gates remain separate work.

#### Automated verification and limitations

- Passed `pnpm lint`, `pnpm typecheck`, `pnpm contracts:check`, `pnpm format:check`, `pnpm test`, `pnpm test:integration`, `pnpm build`, and `pnpm test:built`. Final results: 31 API unit tests, 24 web component/transport tests and 51 migration-backed integration tests passed; aggregate measured line coverage 88.17%, user-administration group 92%, operator provisioning 100% (the ≥80% gate now includes administration logic). The final web follow-up (`pnpm --filter web test`) adds passing empty-page reconciliation and conflict-reload cases; the final integration rerun includes rejection of unsupported staff Google-only reactivation.
- Integration tests use disposable PostgreSQL/Redis, deploy migrations and verify schema drift. Covered all-role authorization/listing, strict bodies/IDs/CSRF/Origin, nullable Google profiles, transactional all-family/action invalidation, two-instance denial, no credential resurrection, invited/credentialless accounts, self/final-admin safety, competing Admins, login/refresh/acceptance races, actor logout/suspension between middleware and write, rollback, all-role transitions, duplicate/concurrent bootstrap, account conflicts and cancellation before commit. Prompt tests cover hidden entry, mismatch/validation, Ctrl+C/EOF/abort and terminal restoration; axe checks the users region (contrast excluded in jsdom).
- Actual root-command smoke checks: `pnpm admin:create` rejects redirected input; a pseudo-terminal run reaches the prompt and Ctrl+C returns cancellation without database work. Automated checks ran on available Node **24.11.1**, not repository pin **24.22.1**. Node/Jest experimental VM and PostgreSQL driver concurrent-query deprecation warnings appeared; the checks passed. No new dependencies meant no dependency audit was required in this phase.
- Scoped `git diff --check -- . ':!output/pdf/SwiftDrop_Design_Report_Corrected.pdf'` passed. Unscoped whitespace checking reports the pre-existing modified PDF as text; that artifact was not altered or normalized here. No browser automation was used. Live browser/Mailpit/Google, layout/contrast/keyboard/zoom, hosted CI, other-member branches and production configuration remain unverified.

#### Exact setup and user-run manual acceptance

From `/Users/umairhassan/Desktop/ead`, with Docker and the repository Node/pnpm versions; retain existing `.env` and keys (first-time setup remains in README):

```sh
pnpm install --frozen-lockfile
pnpm db:generate
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

1. Open `http://localhost:5173/auth/login`; sign in with the README's local Admin fixture and open `/admin/users`. In a separate browser profile sign in as the customer. Suspend that customer, confirm the target/session consequences, then request `/account`/**Check session** in the target profile. Expect login required/private UI cleared; repeat with another existing session. There is no background polling or instantaneous removal of an idle remote screen.
2. Reactivate the customer. Expect old sessions/refresh credentials to stay revoked and fresh login to succeed. Repeat the same status request and expect an unchanged success; cancel a confirmation and double-click a pending action and expect no cancelled/duplicate write. Invited users must use acceptance/revocation; no generic activation bypass. Try self-suspension and expect refusal.
3. In a separate trusted terminal run `pnpm admin:create` with a unique local email. Expect hidden password/confirmation, an active/unverified Admin and ordinary login; no automatic session. Repeat with the same email/different valid password and expect no change/original password preserved. Try a customer, invited or suspended Admin and expect conflict. Test mismatch, short password and Ctrl+C. Use this second Admin for Admin-to-Admin suspension checks against disposable fixtures; the final active Admin must remain available.
4. Filter every role/status, inspect incomplete Google profiles, empty results and pagination, and change a status that removes the final row of a filtered page. Expect a current list or an empty first page. Confirm invitation controls remain staff-only and the existing dispatcher acceptance/courier setup-pending behavior is preserved.
5. Use browser offline mode during status submission. Expect a readable error and enabled controls with no automatic replay; restore connectivity and reload to reconcile an uncertain result before retrying. Non-admin direct navigation/API calls remain denied. Check 360px and desktop, 200% zoom, keyboard-only/native confirmation cancellation/restored focus, labels, visible focus and reduced motion. Record actual browser/device results here; none are claimed yet.

<a id="m01-x03-2026-11-06"></a>
### Implementation: M01 Sprint 3 service identity and booking-contact lookup (6 November 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** worker service JWTs and persisted booking-confirmation lookup · **Reference:** uncommitted on `f6adc50`. Implemented locally; M08/M09/M02 review, M09 provider delivery and merge are not claimed.

#### X-03 proposal and implementation

- Proposal/source contract: the user's Sprint 3 request supplied these service-boundary and event-lookup requirements before implementation; this checkpoint records them in the shared register. Service principals are separate from `User` and human roles; `notification-svc` (`notifications:lookup`) and `webhook-svc` (`webhooks:config`) have distinct audience, principal and RSA key records. RS256 requires ≥3072-bit keys; JWTs carry service kind, subject, issuer/audience, protected and signed key ID, jti, iat/exp, eventId, parcelId and scope. Lifetime ≤300 seconds, clock tolerance 30 seconds, signed scopes cannot exceed current DB permissions, and token-supplied `jku`/`x5u` is rejected. API stores public keys only. See [X-03](#x-03), [C-03](#c-03) and [C-06](#c-06).
- Added one additive migration to the current Prisma schema for `service_principals` and `service_public_keys`, including ownership, audience, scopes, validity and revocation. No human roles or human token interfaces changed. X-03 must pass the existing M10/shared-schema review under C-03 before integration.
- Added a separate Express internal app/listener on `127.0.0.1:${INTERNAL_PORT}` (default 3001), distinct from browser-facing port 3000 and absent from Vite proxy. It serves only `GET /internal/v1/notifications/events/{eventId}`. Responses and errors are `no-store`; invalid auth returns 401, insufficient scope 403, malformed IDs 400, unavailable/mismatched event/parcel 404, and dependency failure 503.
- Lookup supports persisted `parcel.created` only. It verifies signed event/parcel claims against `OutboxEvent.eventId`, `eventType`, `aggregateId` and payload, then queries the current parcel and booking-owner email. Response is strict and contains exactly eventId, parcelId, trackingNumber, customerEmail, recipientName, recipientPhone. Repeated reads support retries, and a suspended customer does not suppress an existing booking. No outbox payload change was made.
- Added local private CLI provisioning/rotation/revocation/status and masked in-memory-signed demo. Private keys and signer metadata are under ignored `.local/services/`, mode 0600, with overwrite refusal. Rotation permits old/new keys for ten minutes; live DB principal/key checks run on every request and apply to requests beginning after revocation commit. `webhooks:config` is a provisioned verifier fixture only; no webhook endpoint/config data contract exists pending M02/M08. M09 still owns templates/provider delivery.

#### Dependencies, overlap and remaining work

- X-03 is a proposed cross-member API/schema contract; review from [M08](#m08), [M09](#m09), M02 and M10 is pending because those branches/PRs were not available. [C-06](#c-06) records potential responsibility overlap: M01's internal booking-contact read touches existing parcel/outbox data while M08 owns eventing and M09 owns notifications. The event format remains unchanged; owners must confirm the endpoint boundary before integration. [C-02](#c-02) still tracks broader parcel/outbox ownership handoff.
- Production worker networking, managed private-key storage, real notification provider delivery, webhook configuration, production deployment, and M08/M09 worker fixtures remain unverified/separate. Existing C-03/C-05 review, C-04/X-15 courier readiness, C-02 handoff and browser/provider acceptance remain open.

#### Automated checks and limitations

- Passed: `pnpm lint`, `pnpm typecheck`, `pnpm contracts:check`, `pnpm format:check`, `pnpm test` (43 API unit + 24 web tests), `pnpm test:integration` (52 migration-backed integration + 43 unit tests; 89.42% combined line coverage, 95.52% service-module lines), `pnpm build`, `pnpm test:built`, `pnpm db:generate`, and Prisma migrate-diff against generated schema during integration. Integration migrates a fresh PostgreSQL database and exercises service-principal/key rows plus revocation across two separately created API instances. Exact key `notAfter` boundary is clock-controlled in unit tests.
- Applied `pnpm db:migrate` successfully to the existing local `swiftdrop` database containing five existing users and no parcels; the new migration only added the two service tables. Provisioned/status-checked both local principals (`notification-svc` and `webhook-svc`) and confirmed their distinct scopes/audiences and active key records. Repeated provisioning refused to overwrite existing signer files; a subsequent status check confirmed the active key remained unchanged. Ran local notification rotation, confirmed new/old key deadlines in status, revoked the retired key, and confirmed the new key stays active. Private files are ignored under `.local/services/` and mode `0600`. No real booking demo was run because the local DB currently has zero parcels; the unit route fixtures and integration revocation test cover lookup and authorization separately.
- Full `docker compose up -d --wait` could not be confirmed in this environment: RabbitMQ and Mailpit image pulls stalled and were interrupted. The repository PostgreSQL/Redis services were started separately and both became healthy; this was sufficient for the populated-database migration check. RabbitMQ-backed runtime behavior remains outside this verification.
- Scoped `git diff --check -- . ':!output/pdf/SwiftDrop_Design_Report_Corrected.pdf'` passed. Unscoped `git diff --check` reports trailing whitespace from the already-modified binary PDF; it was not changed by this iteration. Node/Jest experimental VM and PostgreSQL client deprecation warnings appeared; checks passed. No browser automation, real provider/worker delivery, hosted CI, peer review or production test was performed.
- Manual acceptance has not been run by the user. Exact clean local setup: `cd /Users/umairhassan/Desktop/ead`; retain existing `.env` and human keys; run `pnpm install --frozen-lockfile`, `pnpm db:generate`, `docker compose up -d --wait`, `pnpm db:migrate`, `pnpm services:provision --service notification-svc`, `pnpm services:provision --service webhook-svc`, and `pnpm dev`. Provision once per service/database; this workspace's local database already has both principals, so do not repeat those commands here.
  1. Open `http://localhost:5173/auth/login`, sign in as a customer, create a booking, then run `pnpm services:demo`. Expect successful lookup with masked customer-email/SMS summaries and no token output.
  2. Try the internal path through `127.0.0.1:3000` and Vite `5173`; expect 404. The direct loopback port `3001` serves the valid demo. Check malformed ID 400, absent/invalid/human key 401, missing scope 403, event/resource mismatch 404, and unavailable DB 503.
  3. Run `pnpm services:rotate --service notification-svc`; run `pnpm services:demo --key-id <old-key-id>` before ten minutes and expect success; repeat after deadline and expect 401. Automated clock-controlled checks establish exact boundary. Run `pnpm services:revoke --service notification-svc`; demo should fail with 401. Do destructive credential checks only on disposable local data.
  4. Repeat existing customer login/Admin checks. Browser UI is unchanged; check existing screens at 360px/desktop, 200% zoom, keyboard-only and reduced motion. No browser automation is used; user acceptance remains outstanding.

<a id="m01-main-sync-2026-11-08"></a>
### Integration: fast-forward from main and publish review update (8 November 2026)

**Member:** M01 — doktur-umair · **Branch:** `umair-dev` · **Task:** synchronize `main`, publish the handover update, and prepare review into `main` · **Reference:** PR #9, open.

- Fetched `origin/main` and `origin/umair-dev`. The local branch was at `8d7cf9c`; `origin/main` was at `948133d` and already contained the earlier M01 implementation through PR #8. `origin/umair-dev` was at `b33e15a`.
- Fast-forwarded `umair-dev` to `948133d`, bringing in already-merged M05 lifecycle changes. No conflicts occurred. The existing local `handover.md` edits did not overlap incoming changes and were preserved.
- This checkpoint corrects the shared status to show M01 implementation merged by PR #8 and records the branch synchronization. No application code was changed in this iteration.
- **Checks:** `git diff --check` passed for the handover update. Runtime checks are not applicable; no automated project checks or hosted CI were run. No other member branches or PRs were reviewed.
- **Manual review:** inspect the handover status/integration rows and this checkpoint; PR #9 is open from `umair-dev` to `main` and contains the handover synchronization record. GitHub showed no merge conflicts and 2 of 4 checks successful, with 2 in progress; the Copilot review could not run because the requester lacked remaining review quota. No UI or runtime acceptance is part of this documentation update. Existing M01 browser/provider acceptance and peer reviews remain open as listed in R-01–R-05.
- **Next:** complete review/merge of PR #9 and verify the remaining checks; keep implementation and combined readiness claims scoped to the evidence above.

<a id="m02"></a>
## M02 — TBD

Planned slice (plan.md §4.1): Merchant platform.

### Commit 1: Merchant module scaffold (7 November 2026)

#### Summary of changes
- Registered the confirmed branch mapping M02 → `feature/Merchant`; member name remains TBD.
- Added README placeholders for the merchant backend module and web feature folder, documenting their planned ownership and integration boundaries.
- No API routes, business behavior, schema, or UI were implemented in this structural phase.

#### Issues identified and unresolved
- Shared parcel creation remains an M04 dependency (X-05); webhook delivery/log integration remains an M08 dependency (X-10/X-11). Their implementation/readiness was not checked in this branch review.
- Merchant routes are not mounted yet; route registration and shared web composition require later implementation/integration.

#### Verification and manual review
- Inspected existing module/feature conventions and confirmed the current branch is `feature/Merchant` with a clean initial working tree.
- No automated tests or runtime checks applied to the README-only placeholder change. This was superseded by the implementation checkpoint below.

### M02 checkpoint: Merchant registration and approval (10 November 2026)

#### Summary of changes
- Added the `Merchant` model and additive migration with unique user ownership, business name, pending/approved/rejected status and reviewer audit fields.
- Added strict contracts and generated OpenAPI/typed-client operations for merchant registration, Admin application listing and review decisions.
- Added public `POST /api/v1/merchant/register`, which hashes the password and transactionally creates a `MERCHANT` user plus a `PENDING` business. Duplicate email receives the same generic acceptance response to avoid disclosing account existence.
- Added Admin-only application listing and approve/reject endpoints. Reviews lock the merchant row and only transition a pending application once.
- Added `/auth/merchant-register` signup and `/admin/merchants` review screens; linked merchant signup from customer registration and Admin account shortcuts.

#### Dependencies, boundaries and unresolved work
- API clients, OAuth, merchant orders, webhook settings, dashboard and delivery-log views remain future M02 work.
- Orders must use M04's `ParcelsService`/merchant variant under [X-05](#x-05); M02 must not duplicate parcel creation. Delivery attempts/logs depend on M08 [X-10](#x-10), and webhook configuration lookup remains [X-11](#x-11).
- M02's X-03 boundary review requested under [R-02](#r-02) remains pending; no M01/M08/M09 counterpart branch was inspected. Worker behavior remains unverified.
- Route composition touches `apps/web/src/main.tsx`, a shared M10 integration seam under [X-13](#x-13); no M10 review is claimed.

#### Checks and limitations
- Passed TypeScript checks for contracts, database, core API and web; `prisma validate`; generated-contract drift check; and `git diff --check`.
- No tests were added or run in this checkpoint. No database migration was applied to a running database, and no browser/manual acceptance was performed.

#### Manual acceptance
From the repository root, with `.env` configured and a database available, run `pnpm db:generate`, `pnpm db:migrate`, then `pnpm dev`.

1. Open `/auth/register`, follow the merchant application link, and submit valid business/contact details. Expect a generic application response; retry with the same email and expect the same response without a second account/application.
2. Check invalid email, non-Sri Lankan phone, weak password, mismatched confirmation, and blank/overlong business name. Expect field feedback and no submission. Repeat at narrow mobile width and keyboard-only; focus should move to the first invalid field.
3. Sign in as an Admin and open `/admin/merchants`. Approve an application; expect its status to update and actions to disappear. Try reviewing it again and expect a conflict.
4. Register a second application and reject it. Confirm the browser prompt; expect rejected status. Verify a non-Admin receives 403 and an unauthenticated request receives 401 on Admin endpoints.
5. Send concurrent decisions for one pending application. Expect exactly one to succeed and the other to receive a conflict.

### M02 support: Windows integration test launcher (11 November 2026)

- Starting Docker Desktop resolved the initial Testcontainers runtime error. The next run exposed `spawnSync pnpm ENOENT`: Node's `execFileSync` could not launch the Windows `pnpm.cmd` shim directly from the integration setup.
- Added a Windows `cmd.exe`/`pnpm.cmd` launcher helper for the two migration commands in `apps/core-api/test/auth.integration.test.ts`; non-Windows continues to invoke `pnpm` directly. This is a narrow cross-slice test-harness fix from the M02 task, not a transfer of M01 auth ownership; M01 review remains appropriate before merge.
- `pnpm test:integration` then passed: 9 suites, 131 tests, and 89.42% line coverage. Docker Desktop was running. Node v22.18.0 still emits the repository's unsupported-engine warning (requires Node >=24.11 and <25); the suite passed under this local version. A pg client-query deprecation warning was also emitted.
- This suite does not yet cover the new M02 registration/approval behavior. Merchant migration/model/client behavior remains outside this test suite; browser/manual acceptance and applying the migration to the development database remain pending.

### M02 checkpoint: Merchant API-client management (11 November 2026)

#### Summary
- Added an additive `merchant_api_clients` table/model with merchant ownership, stable client ID, name, scope list, secret hash and rotation/revocation timestamps.
- Added create/list/rotate/revoke contracts and generated OpenAPI/client operations. API routes require an authenticated MERCHANT user and an APPROVED merchant; data lookups are scoped to the owning merchant. Creation is limited to 10 active clients.
- Generated cryptographically random client IDs and 256-bit secrets. Only SHA-256 secret hashes are stored. The client secret appears only in the create/rotate response; rotation invalidates the previous secret while keeping client ID stable.
- Added `/merchant/clients` with create, reveal-once/copy, rotate and revoke controls; added a merchant-account link and responsive form/table styling.

#### Checks and boundaries
- Contract generation and drift check, Prisma validation/client generation, ESLint, TypeScript checks for core-api/web/db/contracts and `git diff --check` passed. Node v22.18.0 emitted the engine warning (required `>=24.11 <25`). No tests were added/run; migration was not applied and browser acceptance was not performed.
- OAuth `/oauth/token`, merchant order creation through M04's X-05, webhook configuration X-11 and delivery log X-10 remain future work. Shared web route composition touches X-13; no M10 review is claimed.

#### Manual acceptance
From the repository root, with `.env` configured and a database available, run `pnpm db:generate`, `pnpm db:migrate`, then `pnpm dev`.

1. Sign in as a pending merchant and open `/merchant/clients`; expect an approval-required message and no client data. A non-merchant must be denied.
2. Approve that merchant in `/admin/merchants`, sign in again and open `/merchant/clients`. Create a client with one or both scopes; expect client ID and secret to appear once. Copy it, dismiss the one-time panel and confirm reload/list does not reveal the secret.
3. Rotate the client; expect the client ID to remain stable and a new secret to appear once. Revoke it and expect revoked status and disabled actions. Try another merchant's client UUID; expect 404.
4. Create up to 10 active clients; the next create should return a limit conflict. Revoke one and create another. Repeat at mobile width, keyboard-only and with clipboard access denied.

### M02 checkpoint: Merchant OAuth client-credentials tokens (12 November 2026)

#### Summary
- Added `POST /oauth/token` outside `/api/v1`. It accepts only `application/x-www-form-urlencoded`, the `client_credentials` grant and HTTP Basic credentials; client credentials in the form body are rejected.
- Added strict form, token-response and OAuth error contracts, Basic-auth OpenAPI documentation and generated types. Tokens are RS256-signed with a dedicated merchant audience, client ID subject, `merchant-client` kind, only granted scopes and a 900-second lifetime. No user role, cookie or refresh token is issued.
- Added client/IP token endpoint throttles (30 per client/minute and 120 per IP/minute), standard OAuth error responses, and `no-store`/`no-cache` headers.
- Extended `access_grants` to reference exactly one human session family or merchant API client. Token issuance records a client grant transactionally. Rotation and revocation delete that client's outstanding grants.
- Added separate machine-token verification and reusable merchant-client authentication/scope middleware. Each request checks the grant, current client, approval state, active owner and current allowed scopes. Human-token verification retains its separate audience.

#### Checks and boundaries
- Prisma generation/validation, generated contract check, workspace TypeScript checks and ESLint passed. Node v22.18.0 emitted the engine warning (required `>=24.11 <25`). No tests were added/run, migration was not applied, and no HTTP/browser acceptance was performed.
- OAuth tokens are ready for the next merchant resource routes, but `/api/v1/merchant/orders` is not implemented. Order creation remains on M04's X-05 service contract; webhook configuration/delivery remain X-11/X-10 coordination with M08.

#### Manual acceptance
From the repository root, run `pnpm db:generate`, `pnpm db:migrate`, then `pnpm dev`. Use an approved merchant and a client created at `/merchant/clients`; enter the secret only in a private HTTP client, not shell history or logs.

1. POST to `/oauth/token` with Basic client ID/secret and form field `grant_type=client_credentials`. Expect 200, a bearer token, `expires_in: 900`, and exactly the client's scopes by default. Confirm `Cache-Control: no-store`, `Pragma: no-cache`, and no `Set-Cookie` header.
2. Request one allowed scope; expect that scope only. Request an ungranted/unknown scope; expect OAuth `invalid_scope` with 400. Try unsupported grant, missing Basic auth, wrong secret, JSON content type and client credentials in the form body; expect `unsupported_grant_type`, `invalid_client`/401 with Basic challenge, or `invalid_request` as appropriate.
3. Inspect the JWT in a local tool without sharing it: expect the merchant audience, client ID subject, `merchant-client` kind, scope claim and 15-minute lifetime; expect no human role. Send a merchant token to `/api/v1/auth/me`; expect 401 because it has the machine audience. Exercise the exported machine middleware when a merchant resource route is added.
4. Issue a token, rotate or revoke its client, then confirm the matching access grant is removed. The machine middleware must reject that token and tokens for suspended owners. Repeat rate-limit checks in a disposable environment and expect 429 with `Retry-After` after the documented threshold.

### M02 checkpoint: Merchant order creation (12 November 2026)

#### Summary
- Added `POST /api/v1/merchant/orders`, protected by the separate merchant machine-token verifier and `orders:write` scope. Human sessions, unapproved merchants, suspended owners and clients without the scope are rejected.
- Added a strict order body for origin/destination districts, package dimensions and recipient details. Pricing is calculated at submission; the API returns the parcel response with its tracking number and fee.
- Added an atomic merchant path to the parcel service: current merchant approval check, quote, merchant-linked parcel, initial history, outbox event and 24-hour idempotency response are written in one transaction. Repeating a key/body returns the stored response; reusing the key with different details returns 409. Different merchant principals have independent key spaces.
- Added nullable `parcels.merchant_id` with a foreign key/index, a migration, an exported parcel service boundary, and generated OpenAPI/typed-client request/response definitions.

#### Checks and boundaries
- Passed Prisma client generation and schema validation, contract generation/check, workspace TypeScript checks, ESLint and `git diff --check`. Node v22.18.0 emits the repository engine warning (requires `>=24.11 <25`). No tests were added/run, the migration was not applied, and no HTTP acceptance was performed.
- The existing required `parcels.user_id` remains the merchant account's user ID for compatibility with current parcel/contact code; `merchant_id` records the business owner used for machine access and future merchant queries. M04 review is required for this parcel service/schema addition; M08 must confirm event consumer expectations. C-02/C-07 remain open. Webhook configuration/delivery and merchant order listing/dashboard are separate work.

#### Manual acceptance
From the repository root, run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm dev`. Use an approved merchant with an API client granted `orders:write`; obtain a token from `POST /oauth/token` and use a private HTTP client.

1. POST valid JSON to `http://localhost:3000/api/v1/merchant/orders` with `Authorization: Bearer <token>`, a unique `Idempotency-Key` of 16–128 allowed characters, and districts/dimensions/recipient fields. Expect 201 with a tracking number, `CREATED` status and fee.
2. Retry the exact body and key. Expect the original response and one parcel/history/outbox/idempotency record. Reuse the key with a changed body; expect 409. Omit or malform the key; expect 400.
3. Try missing/expired/revoked credentials, a human token, a client without `orders:write`, a pending/rejected merchant, suspended owner, unserved district, same origin/destination and missing price. Expect 401/403/422 as appropriate and no partial parcel, quote, history, outbox or idempotency writes.
4. Repeat concurrent identical requests with the same key; expect one order and identical successful responses. Try the same key under another merchant; expect an independent order. The response has no UI flow; review the merchant-owned parcel row and event in local DB/log tooling without exposing token or secret.

<a id="m03"></a>
## M03 — UmarYusuf03 (`umarali`)

### Milestone 1: Pricing Decoupling (C-02), Strategy Pattern (FR-P2), Daily Reports (FR-I7), and Benchmark (NFR-8)

#### Summary of changes
- **Resolved Contradiction C-02**: Successfully decoupled Pricing, Zones, and Quotes logic out of `apps/core-api/src/modules/parcels` into a dedicated `apps/core-api/src/modules/pricing` module and `apps/web/src/features/pricing`. `ParcelService` now delegates quote operations and zone reads cleanly to `PricingService`.
- **Implemented Strategy Pattern (FR-P2 & Design Doc §8.1 / §8.2)**: Created `PricingStrategy` interface, `StandardPricingStrategy` (linear weight tiers + safe integer overflow guard), and `PricingStrategyFactory`. Supports dynamic strategy swapping via `PricingService.setStrategy()`.
- **Implemented Integration Contract X-04 (`PricingService.validateQuoteForBooking`)**: Added strict pre-booking validation ensuring the quote exists, belongs to the authenticated user, is within the 15-minute validity window, and has not yet been consumed.
- **Implemented Daily Operations Reports (FR-I7 & FR-F5)**:
  - Created `apps/core-api/src/modules/reports/service.ts` aggregating daily delivery totals, terminal status breakdown (Delivered vs Failed vs In Transit), and success rate percentages over customizable date ranges.
  - Added RFC 4180 CSV export capability via `exportToCsv()` and `GET /api/v1/admin/reports/daily?format=csv`.
  - Added `apps/core-api/src/modules/reports/routes.ts` protected by `requireRole("ADMIN", "DISPATCHER")`.
  - Created frontend `AdminReports` page at `/admin/reports` with interactive date range filtering, KPI summary cards (Total Booked, Delivered, Failed, Success Rate %), daily breakdown table, and one-click "Export CSV" download.
  - Added navigation shortcuts in user account view for both `ADMIN` and `DISPATCHER` roles.
- **Implemented Performance Benchmark Suite (NFR-8)**: Added `scripts/benchmark-p95.mjs` verifying $p95 < 300\text{ ms}$ SLA. The pure pricing engine achieved over 3.7 million operations per second with $p95 \approx 0.00\text{ ms} \ll 300\text{ ms}$.
- **Contracts & OpenAPI Sync**: Added `dailyReportQuerySchema`, `dailyReportItemSchema`, and `dailyReportSummarySchema` to `packages/contracts/src/index.ts`. Updated `packages/contracts/src/generate.ts` and regenerated `openapi.json` and `api.generated.ts`.

#### Checks actually run
- `pnpm typecheck`: Passed with 0 errors across all 4 workspace packages (`@swiftdrop/db`, `@swiftdrop/contracts`, `apps/core-api`, `apps/web`).
- `pnpm contracts:check`: Passed with 0 drift against `openapi.json`.
- `pnpm lint`: Passed with 0 errors and 0 warnings.
- `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config jest.config.cjs --selectProjects unit`: 7/7 test suites passed, 67/67 tests passed (including 12 new pricing unit tests and 3 new reports unit tests).
- `vitest run` (`apps/web`): 5/5 test suites passed, 24/24 tests passed.
- `pnpm benchmark`: Passed with $p95 < 300\text{ ms}$.
- `pnpm build`: Both frontend Vite bundle (gzip ~142 KB, within < 250 KB budget) and core-api tsup dist built cleanly.

#### Issues identified and resolved
- On Windows PowerShell, inline `NODE_OPTIONS=...` in `apps/core-api/package.json` failed. Updated test runner scripts to invoke `node --experimental-vm-modules ./node_modules/jest/bin/jest.js` directly.
- The `Parcel` database model specifies `status` instead of `currentStatus`; updated `ReportsService` queries accordingly.
- Fixed query parameter registration in OpenAPI contract generation to avoid `never` query parameter types in the generated client.

#### Manual test plan for this iteration
1. **Zones & Pricing Management**:
   - Log in as an Admin (`admin@swiftdrop.test`).
   - Navigate to `/admin/zones`. Verify existing zones list, toggle a district's active status, add a new test district.
   - Navigate to `/admin/pricing`. Create a new pricing rule with a future effective date.
2. **Delivery Quotes**:
   - Log in as a Customer (`customer@swiftdrop.test`).
   - Navigate to `/parcels/new`. Enter package details between Colombo and Kandy. Expect calculated fee (e.g. LKR 570.00 for 2kg) with 15-minute expiration timestamp.
3. **Operations Reports & CSV Export**:
   - As an Admin or Dispatcher, navigate to `/admin/reports`.
   - Verify KPI summary cards render delivery volumes and success rate %.
   - Filter by date range (e.g. past 14 days). Verify the daily breakdown table renders.
   - Click "Export CSV". Verify a file named `daily-delivery-report-<from>-to-<to>.csv` downloads containing properly formatted RFC 4180 CSV data.
4. **Benchmark**:
   - In terminal, execute `pnpm benchmark`. Expect terminal table displaying operations count and confirmation that $p95 < 300\text{ ms}$ (PASS).

### Milestone 2: AI Delivery Assistant (FR-B2) & Floating Chat Widget (FR-F9)

#### Summary of changes
- **Implemented AI Delivery Assistant Service (FR-B2 & Design Doc §12.2)**:
  - Created `apps/core-api/src/modules/assistant/service.ts` providing 4 grounded read-only MCP tools:
    1. `quote_delivery_fee`: Quotes fee between two active districts for a given weight using the active `PricingStrategy`.
    2. `get_parcel_status`: Retrieves real-time public parcel tracking status by tracking number (`SD...`).
    3. `list_my_parcels`: Lists parcels for the authenticated user, or prompts guest users to log in.
    4. `find_zone`: Discovers active districts and towns served across Sri Lanka.
  - Natural-language intent recognition and deterministic tool execution engine grounded strictly in real database data without hallucination.
- **Added Assistant Router & OpenAPI Schema**:
  - Added `POST /api/v1/assistant/chat` endpoint in `apps/core-api/src/modules/assistant/routes.ts` with optional Bearer JWT resolution and IP rate limiting.
  - Registered Zod contracts `assistantChatInputSchema` and `assistantChatOutputSchema` in `packages/contracts/src/index.ts` and regenerated OpenAPI with 0 drift.
- **Implemented UI Chat Widget (FR-F9)**:
  - Created `apps/web/src/features/assistant/ChatWidget.tsx`: accessible floating button at bottom-right, expandable dialog window with quick action suggestion chips, scrollable message history, and live API dispatch.
  - Mounted in `apps/web/src/main.tsx` globally across all screens.

#### Checks actually run
- `pnpm typecheck`: 0 errors across all 4 workspace packages.
- `pnpm contracts:check`: Clean with 0 drift.
- `pnpm lint`: 0 errors, 0 warnings.
- `node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/assistant.unit.test.ts`: 6/6 tests passing.
- `vitest run src/features/assistant/ChatWidget.test.tsx`: 4/4 component tests passing.
- `pnpm --filter web test`: 35/35 frontend tests passing across all 8 suites.
- `pnpm build`: Clean production build.

<a id="m04"></a>
## M04 — TBD

Planned slice (plan.md §4.1): Customer booking and parcel records. No work recorded.

<a id="m05"></a>
## M05 — TBD

Planned slice (plan.md §4.1): Parcel lifecycle, cancellation and public tracking. No work recorded.

<a id="m06"></a>
## M06 — TBD

Planned slice (plan.md §4.1): Dispatch and courier capacity. No work recorded.

<a id="m07"></a>
## M07 — TBD

Planned slice (plan.md §4.1): Courier delivery and offline PWA. No work recorded.

<a id="m08"></a>
## M08 — TBD

Planned slice (plan.md §4.1): Eventing and webhook delivery. No work recorded.

<a id="m09"></a>
## M09 — TBD

Planned slice (plan.md §4.1): Notifications and realtime. No work recorded.

<a id="m10"></a>
## M10 — TBD

Planned slice (plan.md §4.1): Platform kernel and web foundation. No work recorded.

## Customer booking and tracking implementation checkpoint (29 October 2026)

### Summary of changes
- Added parcel zones, effective-dated pricing, expiring quote snapshots, customer parcels/history, status history, idempotency records and an outbox in an additive Prisma migration. Seed adds the Colombo → Kandy LKR 570.00 / 2 kg fixture.
- Added quote/booking/read/tracking/Admin endpoints with profile and role guards, customer scoping, idempotency conflict behavior, transactional history/outbox writes, safe public tracking fields and generated OpenAPI/client contracts.
- Added quote/review/confirmation, paginated customer history/detail/timeline, anonymous public tracking, Admin zone/pricing screens, and bounded visible-tab polling.
- Added RabbitMQ durable parcel event relay and metadata-only consumer with database-backed retry/recovery, readiness reporting and Compose service. Updated the Google OIDC adapter to explicitly validate ID-token signatures; deterministic adapter tests cover signature, issuer, audience/authorized party, expiry, email verification, nonce/state and PKCE failures.
- Upgraded Nodemailer to 10.3.1 after `pnpm audit` identified high-severity advisories and removed its redundant DefinitelyTyped package. Updated README and top-level roadmap status. Removed the completed `docs/next-sprint-plan.md` and `docs/auth-sprint-plan.md`; the active roadmap, acceptance steps and remaining work are retained here and in README.

### Issues identified / unresolved
- Automated PostgreSQL/API integration passes booking, privacy, concurrency, role/profile policy and migration checks. It does not run a real RabbitMQ broker; an attempted broker container pull stalled. Relay confirmation/restart/outage behavior still needs the manual broker check below or a reliable broker-backed CI run.
- Google live consent needs a private development client. Browser/layout/accessibility acceptance has not been performed by the user. The migration was exercised against disposable test databases, not a populated production-like database.
- Audit has no high-severity advisories; three low/moderate advisories remain. Production mail delivery, durable audit, key management, TLS deployment, operations/staff/merchant workflows and later roadmap requirements remain outside this increment.

### Automated check results
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm contracts:check`, `pnpm test`, `pnpm build`, `pnpm test:built`, `pnpm audit --audit-level high`, and `git diff --check` pass. Unit: 24 API + 8 web tests; integration: 30 API tests. API build serves its health route.
- The full integration run initially exposed an invalid incomplete-user fixture; the fixture now uses a Google-only account, and the full 30-test suite passes. Earlier adapter testing also found signature validation was not explicitly enabled; it is now enabled and a bad-signature case rejects.

### Manual test plan / future work
From `/Users/umairhassan/Desktop/ead`, run:

```sh
cp -n .env.example .env
pnpm install --frozen-lockfile
pnpm auth:keys:generate # first setup only
pnpm db:generate
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

1. Open `http://localhost:5173/auth/login`, sign in as `customer@swiftdrop.test` with the development-only README password, and open `/parcels/new`. Quote the seeded Colombo → Kandy 2 kg parcel; expect LKR 570.00. Check unsupported areas, invalid inputs, quote expiry, review-before-submit, and a retry after a lost response.
2. Confirm a booking, double-click while pending, reload `/parcels`, inspect its detail/history and follow public tracking. Expect one booking/history item and no recipient name, phone or address on the public page. Use a second customer to check private detail returns 404.
3. Sign in as `admin@swiftdrop.test`; add/toggle a zone and a future price at `/admin/zones` and `/admin/pricing`. Confirm old quote snapshots stay unchanged; customer requests to Admin routes must be denied.
4. Stop RabbitMQ with `docker compose stop rabbitmq`, book a parcel, and check booking remains successful while readiness marks the broker unavailable. Start it with `docker compose start rabbitmq`; check readiness recovers, pending events process and restart does not duplicate bookings.
5. Exercise Redis/PostgreSQL outage and browser offline behavior. Repeat the booking/tracking/Admin flow at 360px, desktop, 200% zoom, keyboard-only and reduced-motion settings. If Google credentials are present, repeat Google sign-in/profile/link/collision checks from README.

No manual browser or live-provider acceptance is claimed until those results are recorded here. Next implementation work follows the original operations/merchant roadmap; keep broker-backed recovery tests and production gates in the next phase.
