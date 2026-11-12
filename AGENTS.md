# Agent Rules

## Working agreement

- Inspect the existing project structure, conventions, and relevant files before changing code.
- Make the smallest complete change that solves the requested problem. Reuse existing patterns and dependencies before adding new ones.
- Keep code readable, modular, and easy to remove or extend. Avoid speculative abstractions, duplicate logic, and unnecessary dependencies.
- Preserve unrelated user changes. Never overwrite or delete files unless the task explicitly requires it.
- Explain important assumptions, trade-offs, limitations, and any deferred work in the final handoff.

## Testing and verification

- Use deterministic checks that fit the project, such as type checks, linters, unit tests, build checks, and focused scripts.
- Do not use Selenium or browser automation for testing.
- Do not claim that a feature is manually verified when it has not been verified by the user.
- After each implementation iteration, provide a concise manual test plan with:
  - exact setup or start commands;
  - the screen, route, or feature to open;
  - numbered actions;
  - expected results;
  - important edge cases, responsive states, and failure states to check.
- Report what was checked, what was not checked, and any remaining risk.

## UI and UX

- Prefer clear hierarchy, predictable interactions, useful feedback, and sensible defaults.
- Design loading, empty, success, validation, permission, offline, and error states deliberately.
- Make keyboard navigation, focus visibility, labels, contrast, semantic structure, and reduced-motion behavior work from the start.
- Use responsive layouts that remain usable on small screens and large screens without hiding essential actions.
- Keep interaction feedback immediate and understandable; prevent duplicate submissions and accidental destructive actions.

## Security and reliability

- Treat all external input as untrusted. Validate at trust boundaries and encode or parameterize output appropriately.
- Keep secrets, tokens, private data, and credentials out of source code, logs, client bundles, and committed files.
- Use least privilege, safe defaults, explicit authorization checks, and useful error handling without leaking sensitive details.
- Protect data integrity: handle retries, partial failures, invalid state, concurrency, and destructive operations deliberately.

## Efficiency, free-tier cost, and scalability

- Prefer platform features and installed dependencies over new services or packages.
- Minimize network requests, payload size, repeated work, unnecessary renders, and unbounded data loading.
- Use pagination, caching, debouncing, batching, and lazy loading when they solve a demonstrated or likely scale problem without obscuring the code.
- Design free-tier usage deliberately: avoid paid-only infrastructure, hidden usage multipliers, and unnecessary background polling unless absolutely necessary.
- Keep boundaries replaceable so storage, APIs, and hosting can scale later without premature complexity.

## Completion standard

A task is complete only when the requested behavior is implemented, relevant automated checks pass or their limitations are stated, the changed code is reviewed for security and accessibility risks, and the final response includes the manual testing instructions the user should run.

## Ten-member identity and branch ownership

This registry is the source of contributor identity across chats and branches. IDs are permanent and correspond to the numbered delivery slices 1–10 in [plan.md §4](plan.md#4-team-structure-and-ownership); application account roles are unrelated. Earlier layer-based role letters (A1…E2) are legacy and translated by plan.md §4.6. Fill names and exact branch mappings only when supplied by the user. Keep IDs stable when names or assignments change, and record reassignment history in the shared handover.

| Member ID | Delivery slice (plan.md §4.1) | Name | Owned branches |
| :-- | :-- | :-- | :-- |
| M01 | 1 / Identity, access and user administration (also silent-work steward) | doktur-umair | `umair-dev` |
| M02 | 2 / Merchant platform | TBD | `feature/Merchant` |
| M03 | 3 / Pricing, zones and reports | TBD | TBD |
| M04 | 4 / Customer booking and parcel records | TBD | TBD |
| M05 | 5 / Parcel lifecycle, cancellation and public tracking | TBD | TBD |
| M06 | 6 / Dispatch and courier capacity | TBD | TBD |
| M07 | 7 / Courier delivery and offline PWA | TBD | TBD |
| M08 | 8 / Eventing and webhook delivery | TBD | TBD |
| M09 | 9 / Notifications and realtime | TBD | TBD |
| M10 | 10 / Platform kernel and web foundation | Lavin | `lavin-dev` |

At the start of every new chat, after switching branches/worktrees, and before attributing a handover entry:

1. Read this registry, `git branch --show-current`, `git status --short`, the shared integration section of `handover.md`, the relevant member sections, and the applicable ownership/task plan.
2. Use the user's explicit member ID or registered name for this task; otherwise resolve an exact registered branch mapping. A suggested convention for new branches is `codex/m01/<task>` through `codex/m10/<task>`, but a branch becomes identity evidence only after registration. The current mapping is `M01 → doktur-umair → umair-dev`; other branches stay unassigned until the user maps them.
3. If identity is missing, ambiguous, detached, or conflicts with branch ownership, ask the user to identify the member/branch assignment before member-specific implementation or attribution. Continue independent inspection while waiting. Never infer identity from the OS username, Git author, authenticated GitHub account, old chat memory, or the module being edited. A contributor may support someone else's module without becoming its owner.
4. State the resolved member ID, branch and task scope in the initial work update. Record user-confirmed mappings here so later chats can recover them. Work on that member's branch; branch creation/switching must preserve existing changes. Keep mappings unique and available on the shared base branch through normal review/merge so other clones receive them.

An explicit repository-wide documentation task can proceed with identity marked `unassigned`; attribute any handover checkpoint to shared integration rather than inventing a contributor. Registry identity is for attribution and coordination, not a substitute for GitHub permissions or required reviews.

## Work distribution principles

- Work is divided by **vertical deliverable slices** (one per member, defined in [plan.md §4](plan.md#4-team-structure-and-ownership)), not by technical layer. A member's task includes **everything** the deliverable needs: database tables and migrations, contracts, backend, frontend (including admin/staff screens mounted inside another console), mocks, tests and docs. Example: the identity slice covers auth backend, auth UI, user-administration UI and the identity tables.
- Complexity is balanced across backend, database, frontend and quality/security work. **Silent work** (folder structure, CI/CD, Compose/Docker, Kubernetes/Helm, lint presets, repository automation) is excluded from that balance; the steward in plan.md §4.4 maintains it and each member adds the entries for their own services.
- Every slice must be startable and demoable independently with contracts, fakes and mocks; integration happens through the contracts in plan.md §10.
- **The parts recorded for a member in `handover.md` may not always match that member's slice in the work-distribution file (`plan.md`), and that is acceptable.** Members support each other, fix cross-slice issues and take over work; the handover records what was actually done, attributed by identity. Do not rewrite either document to force a match. Note a mismatch in the shared integration section only when it creates a dependency, ownership or review ambiguity.
- A slice listed in `plan.md` is a planning default, not a restriction on who may contribute. Editing another member's slice still follows the CODEOWNERS/review rules and the contract protocols in plan.md §§7.5–7.6.

## Handover: ten member parts, one integration point

After every completed implementation phase/iteration, update `handover.md`. On its next structural update, preserve the existing entries verbatim under `## Legacy history (unattributed)` unless authorship is evidenced; do not retroactively assign the existing multi-role work to whoever is currently using the agent.

Maintain these sections in this order:

- `## Shared integration`: the single current view connecting all ten members.
- `## M01 — <name or TBD>` through `## M10 — <name or TBD>`: exactly ten permanent member sections, including empty slots marked `No work recorded`. Use the IDs in stable explicit anchors (`<a id="m01"></a>` through `<a id="m10"></a>`) so links survive name changes.
- `## Legacy history (unattributed)`: preserved pre-registry history, if present; this is historical context, not another member slot.

### Member entries

Append dated checkpoints inside the active member's section. Include member ID, branch, task/issue and commit or PR reference when available (otherwise `uncommitted`); summary and touched modules/files; issues identified/resolved; unresolved issues and future work; actual automated checks and limitations; exact setup/start commands and numbered manual actions with expected results and relevant edge/failure/responsive cases. Mark documentation-only runtime checks as not applicable. Preserve earlier entries and distinguish planned, implemented, reviewed and merged work; implementation on one branch does not establish integration.

For each cross-member dependency, link to the shared integration item and the other member's stable anchor. Record what this member produces, what they consume, the agreed API/schema/event/component contract, and the readiness/blocker. Update another member's history only for a user-authorized correction, preserving attribution. A member's handover entries describe the work they actually did; they are not required to match that member's planned slice in `plan.md` (see Work distribution principles).

### Shared integration and contradictions

- Maintain a ten-row member status index linking to each member section, with branch/task, delivered versus merged status, dependencies and next step. Record the integration target branch, checked revision/date, merge order, combined verification and remaining release blockers. Use references to member checkpoints instead of copying their detailed histories.
- Keep one dependency/contract register: item ID, producer and consumer member IDs, contract/source location, affected files, readiness, required merge order and evidence. Shared schema/contracts/generated clients, auth/platform boundaries, shared web routing/components/mocks, and parcel/dispatch/courier offline behavior require explicit coordination under `plan.md` §§4, 7.5–7.6 and 10.
- Before implementing shared behavior and before handing off, compare the relevant member entries, plans and available changes for incompatible requirements, duplicate implementations, competing edits, API/schema/event drift, missing dependencies and inconsistent completion claims. Identify overlaps even when Git reports no textual conflict.
- Record each contradiction or overlap with a stable ID, involved members, both positions with file/section or commit evidence, impact, proposed resolution, responsible owner/reviewer and status (`open`, `agreed`, `implemented`, `verified`). Call material findings out in progress updates and the final handoff. Treat suspected overlap as a risk until evidence confirms a conflict.
- Follow documented ownership and review rules. Agree shared contracts before dependent implementations; limit cross-owner edits to the authorized task and record temporary support without silently transferring ownership. Escalate unresolved product/ownership decisions to the user, and continue unaffected work. Keep incompatible dependent work blocked until the decision is recorded.
- Resolve merge conflicts by retaining both members' attributed entries and reconciling the shared integration view against actual code/checks. Never choose an entire handover file from one branch or mark an issue resolved solely because the merge succeeds. Preserve old decisions with superseding references.
- Report the evidence boundary: local branches, fetched revisions or supplied PRs actually inspected. If other contributors' work is unavailable or stale, list the unverified dependencies; never claim all ten branches were checked. Re-run relevant combined checks after integration before recording integrated readiness.

After transferring necessary decisions, outstanding work and verification instructions into maintained documents, delete a temporary implementation/plan file only when it is no longer needed for active work. Keep `plan.md` while it remains the team ownership/delivery reference, and retain plans used by other members.

# same files, but small differences
- SwiftDrop design report.pdf file in this folder contains entire report with the diagrams
- SWIFTDROP_DESIGN_DOCUMENTATION.pdf file is the same as the above report, but without the diagrams (usecase diagrams and flowchartss)
