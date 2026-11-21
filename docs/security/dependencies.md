# Dependency review ? 21 November 2026

Resolved the high-severity Effect ReDoS advisory [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw). Prisma 7.10.1's `@prisma/config` dependency previously selected `effect@3.20.0`; the scoped pnpm override `@prisma/config>effect: 3.22.1` selects the patched release for both Prisma paths without changing Prisma/client versions. The lockfile is regenerated; the CI audit threshold remains unchanged. Remove/reassess the override when Prisma adopts a patched version upstream.

Validation on Node 24.22.1 / pnpm 11.25.0: frozen-lockfile install, `pnpm audit --audit-level high`, `pnpm db:generate`, `pnpm --filter @swiftdrop/db typecheck`, and notification integration tests (2 suites, 6 tests, using disposable containers) passed. The audit still reports 1 low and 6 moderate findings; this fix does not resolve or newly approve those findings. GitHub CI has not been rerun for this local change.

## Historical review ? 29 October 2026


`pnpm audit --audit-level high` passes: no high/critical findings. React Router was upgraded to 7.18.5 to resolve the initial runtime redirect/SSR findings. The three remaining advisories are accepted **for local development/testing only**, pending upstream fixes. Recheck before every release and next sprint; these are not blanket production exceptions.

| Dependency / advisory | Installed path and applicability | Follow-up |
| --- | --- | --- |
| `uuid` 10.0.0, moderate — [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Testcontainers → Dockerode; affected buffer-accepting v3/v5/v6 helpers are not called by SwiftDrop. No application runtime dependency. | Platform owner: update Testcontainers/Dockerode when it adopts a patched compatible uuid (≥11.1.1). Avoid a forced major override. |
| `esbuild` 0.27.7, low — [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | tsup / ts-jest; advisory concerns Windows development-server file reads. SwiftDrop uses build transforms, and Vite's dev server binds loopback. No esbuild server is exposed. | Platform owner: update build/test wrappers when they adopt ≥0.28.1. |
| `deepmerge` 4.3.1, low — [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | Jest configuration merging. Configuration is repository-controlled; untrusted request bodies never enter Jest. Audit reports no patched version. | Platform owner: track upstream; do not load untrusted test configuration. |

The locally available Node runtime used for checks was **24.11.1**. `.node-version` / CI pin **24.22.1**, the reviewed Node 24 security release. Update the local runtime to the pin before release; this local test result is not evidence for the pinned patch or production deployment. The pinned release is documented at https://nodejs.org/en/blog/release/v24.22.1 .

CI contains high/critical dependency gating and a gitleaks job. Hosted CI and gitleaks have not run during this local implementation; do not claim those checks passed. TLS, proxy/cookie behavior in production, signing-key rotation/restore, MFA, production mail and load calibration remain the later-phase gates in `docs/auth.md`.
