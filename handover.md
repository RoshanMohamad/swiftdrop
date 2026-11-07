# Handover

## Shared integration

Current identity registry: **M01 — doktur-umair**, branch **`umair-dev`**. All existing handover entries below are attributed to M01 based on the user's explicit mapping. They remain historical checkpoints and do not imply that the other nine members' work is complete or integrated.

Work distribution (29 October 2026): [plan.md §4](plan.md#4-team-structure-and-ownership) divides the work into ten vertical delivery slices of ≈ equal complexity, each owning its own database, backend, frontend and tests; silent infrastructure work is excluded from the balance. Per [AGENTS.md](AGENTS.md), what a member's section records may differ from that member's planned slice, and that is acceptable.

### Member status index

| Member | Name | Branch | Planned slice (plan.md §4.1) | Delivered vs merged | Depends on | Next step |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| [M01](#m01) | doktur-umair | `umair-dev` | Identity, access and user administration (+ silent-work steward) | Sprint 1 dispatcher invitation provisioning/API/Admin UI implemented locally, uncommitted; prior auth/Google/verification and other historical work as recorded; merge to `main` not verified | X-01/X-13 (M10 review), X-15 (M06 readiness), X-03 (M08/M09) | Obtain M10 schema/contract review for C-03 and M06 courier readiness for C-04; then integrate; Sprint 2 suspension/bootstrap remains next; C-02 handoff open |
| [M02](#m02) | TBD | `feature/Merchant` | Merchant platform | Commit 1 scaffold added locally, uncommitted; not merged | X-05, X-11 | Add merchant schema, contracts, and registration/approval against fake `ParcelsService` |
| [M03](#m03) | TBD | TBD | Pricing, zones and reports | No work recorded (pricing/quote baseline exists in M01's local code, C-02) | X-04 | Take over pricing code; FR-I7 reports |
| [M04](#m04) | TBD | TBD | Customer booking and parcel records | No work recorded (booking baseline exists in M01's local code, C-02) | X-04, X-06, X-09 | Take over booking code; merchant/staff variants |
| [M05](#m05) | TBD | TBD | Parcel lifecycle, cancellation and public tracking | No work recorded (public tracking baseline exists in M01's local code, C-02) | X-05, X-07 | Transition table and `LifecycleService` |
| [M06](#m06) | TBD | TBD | Dispatch and courier capacity | No work recorded | X-06, X-07 | Courier capacity tables and assignment protocol |
| [M07](#m07) | TBD | TBD | Courier delivery and offline PWA | No work recorded | X-06, X-08 | PWA shell, offline queue, operation ledger |
| [M08](#m08) | TBD | TBD | Eventing and webhook delivery | No work recorded (relay baseline exists in M01's local code, C-02) | X-03, X-11 | Move relay to owned service; webhook-svc |
| [M09](#m09) | TBD | TBD | Notifications and realtime | No work recorded | X-03, X-08, X-09 | Notification templates, realtime gateway |
| [M10](#m10) | TBD | TBD | Platform kernel and web foundation | No work recorded | None (foundation) | Kernel, shell, typed client, MSW harness |

Integration target: `main`. Checked base revision/date: `umair-dev` at `7a348f8`, 30 October 2026; Sprint 1 implementation and verification are current uncommitted working-tree changes. Merge order: kernel and contracts (X-01, X-09) → identity guards (X-02) → pricing/parcels/lifecycle (X-04–X-06) → dispatch/courier (X-07, X-08) → messaging consumers (X-10–X-12) → UI composition (X-13). Local M01 checks passed; combined ten-branch verification was not performed. Release blockers: M10 schema/contract review (C-03), M06 courier readiness contract (C-04/X-15), no other member branches inspected, and production gates listed in M01 checkpoints.

### Dependency and contract register

Contract definitions are in [plan.md §10](plan.md#10-integration-contracts-between-owners). Readiness is **planned** unless stated; nothing here has been integrated or verified across branches.

| ID | Producer → Consumer | Contract/source | Affected files | Readiness | Evidence |
| :-- | :-- | :-- | :-- | :-- | :-- |
| X-01 | M10 → all | Kernel, typed client, MSW harness | `apps/core-api/src/shared`, `apps/web/src/shared` | Partial baseline in M01's local code (`shared/problem.ts`, `config.ts`, `rate-limit.ts`); not split to M10 | Local tree only |
| X-02 | M01 → all | `authenticate`, `requireRole`, `req.user` | `apps/core-api/src/modules/auth` | Implemented locally, unmerged | M01 checkpoints below |
| X-03 | M01 ↔ M08/M09 | Service-JWT issuance/verifier for worker lookups | Not created | Planned (Sprint 0 contract, Sprint 2 code) | None |
| X-04 | M03 → M04 | `PricingService.quote()`, owner-bound `quoteId` | `modules/parcels` (combined today) | Quote code exists locally in the combined module | C-02 |
| X-05 | M04 → M02, M05, M06, M07 | `ParcelsService.createFromQuote()` and variants, idempotency | `modules/parcels/service.ts` | Customer path implemented locally | C-02 |
| X-06 | M05 → M04, M06, M07, M02 | Transition table, `LifecycleService` | `packages/contracts` | Planned | None |
| X-07 | M05 ↔ M06 | Shared lock protocol | Docs/code not created | Planned | None |
| X-08 | M06 → M07 | Assigned-parcel read model, `parcel.assigned` | Not created | Planned | None |
| X-09 | M08 → all producers | `outbox.add(tx, event)` | `modules/parcels/events.ts` | Relay/outbox implemented locally in the combined module | C-02 |
| X-10 | M08 → M09, M02 | Topology constants, delivery-log API | `packages/messaging` (not created) | Planned | None |
| X-11 | M02 → M08 | Merchant webhook config lookup | Not created | Planned | None |
| X-12 | M09 → web | Socket.IO `parcel:status` / `parcel:assigned` | Not created | Planned | None |
| X-13 | every member → M10 | `routes.tsx`, `nav.ts`, MSW handlers | `apps/web/src/features/*` | Planned | None |
| X-14 | every member → M01 | Dockerfile/Compose/CI/Helm entries | `compose*.yaml`, `.github/` | Compose/CI exist from M01; per-service entries planned | Local tree only |
| X-15 | M06 ↔ M01 | Proposed courier profile/readiness contract before invitation activation; `docs/auth.md` §4.5 | `modules/users`, future M06 courier profile module/schema | Unagreed; dispatcher onboarding proceeds independently; courier acceptance returns setup-pending without consuming its invitation until required fields, writer and atomicity are agreed | M01 Sprint 1 implementation checkpoint, 30 October 2026; C-04; no M06 branch inspected |

### Contradictions and overlaps

| ID | Members | Positions and evidence | Impact | Proposed resolution | Owner/reviewer | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| C-01 | All | `docs/auth.md` phase tables and the earlier handover "Phase 1" entry assign work to layer-based roles A1–E2; [plan.md §4.1](plan.md#4-team-structure-and-ownership) assigns vertical slices M01–M10. | Wrong owner named in an auth phase; duplicated or skipped work | Ownership note in `docs/auth.md` plus plan §4.6 crosswalk; history preserved | M01 / each slice owner | implemented (documentation only) |
| C-02 | M01, M03, M04, M05, M08 | Plan assigns pricing (M03), booking (M04), tracking (M05) and relay (M08) to separate owners; the delivered code keeps quotes, booking, public tracking and the AMQP relay in `apps/core-api/src/modules/parcels/{routes,service,events}.ts` and `apps/web/src/features/parcels`. | Merge conflicts and unclear ownership on first touch by new owners | No-behaviour-change refactor PRs split the module per plan §4.1 before feature work in that area | M01 (author) with the receiving owner as reviewer | open |
| C-03 | M01, M10; shared-schema owners | Plan §4.1/§7.5 expects per-domain `identity.prisma`; actual `packages/db/prisma.config.ts` and integration harness target one `prisma/schema.prisma`. X-02 says `req.user`, while `modules/auth/index.ts` implements `res.locals.user`/`authFamilyId`; Sprint 1 adds an invitation model/migration to the current schema path on M01's branch. | Schema ownership/review and downstream authentication consumers need a recorded contract before integration | M10 and affected owners review the additive current-schema migration or agree a coordinated split; preserve current middleware and reconcile interface wording | M01 with M10 and affected schema/contract reviewers | open (implementation local; shared review and schema-path decision pending) |
| C-04 | M01, M06 | FR-A5 requires courier provisioning; `docs/auth.md` §4.5 requires a usable courier profile before activation, but no courier profile schema/module or M06 delivery is available locally. | Activating a role-only courier could imply operational readiness without capacity/profile data | Proposed X-15 defines required fields, responsibility and atomic activation; local Sprint 1 lets admins invite couriers but returns setup-pending on acceptance without consuming the invitation | M01 with M06 | open (runtime guard implemented locally; M06 contract and courier completion are not agreed/claimed) |

Evidence boundary: only the working tree on `umair-dev` and the documents named above were inspected. No other branch, fetched revision or pull request was available; all M02–M10 dependencies are unverified.


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
- No automated tests or runtime checks apply to README-only placeholders. Review the two README files and `git diff --check` before committing.

<a id="m03"></a>
## M03 — TBD

Planned slice (plan.md §4.1): Pricing, zones and reports. No work recorded.

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
