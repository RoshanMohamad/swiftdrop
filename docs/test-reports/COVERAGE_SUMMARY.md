# SwiftDrop: Coverage Summary

Run 2026-11-22, branch `web-redesign`. Full results and caveats: [TEST_REPORT.md](TEST_REPORT.md). Raw output: [raw/](raw/).

| Workspace | Tests passed | Line coverage | Notes |
|---|---|---|---|
| core-api (unit + integration) | 530 | **92.76%** (statements 91.51%, branches 85.77%, functions 91.54%) | Gate: 80% lines on service and domain files (`apps/core-api/jest.config.cjs`) |
| outbox-relay | 6 unit, 3 integration | 100% | unit project |
| webhook-svc | 29 unit, 6 integration | 92.26% | unit project |
| notification-svc | 56 unit, 6 integration | 74.14% | unit project only |
| ai-assistant | 7 unit | 67.56% | unit project only |
| messaging (shared package) | 16 unit | not measured | |
| web | 157 | not measured | no coverage plugin installed |

Reproduce: `pnpm test` (unit), `pnpm test:integration` (needs Docker; starts Postgres, RabbitMQ, Redis and MinIO through Testcontainers).
