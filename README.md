# SwiftDrop

Customer authentication and the next customer booking/tracking increment are implemented locally: password signup/login, optional mailbox verification, Google customer sign-in/linking, profile completion, rotating sessions, quotes, booking/history, public tracking, Admin zone/pricing maintenance, a standalone outbox relay (`apps/outbox-relay`) and a webhook dispatcher with Admin delivery log/replay (`apps/webhook-svc`; see [docs/messaging.md](docs/messaging.md)). This remains an initial product slice; parcel operations, staff/merchant workflows and production security gates are not complete.

## Start locally

Use Node.js **24.22.1** (see `.node-version`), pnpm **11.25.0**, and Docker. From this repository:

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

Key generation refuses to overwrite existing keys. Skip that command on subsequent starts. Open [the web app](http://localhost:5173/auth/login), [API health](http://localhost:5173/api/health), [readiness](http://localhost:5173/api/ready) or [API documentation](http://localhost:5173/api/docs). Vite proxies `/api` to the API at `127.0.0.1:3000`. PostgreSQL uses localhost:5432; Redis uses localhost:6380 to avoid another local project's Redis. Infrastructure ports bind to loopback only. Verification mail is captured at [Mailpit](http://localhost:8025); Google sign-in requires private development credentials and remains unavailable until configured.

For Google sign-in, create a Google OAuth **Web application** client and put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL=http://localhost:5173/api/v1/auth/google/callback` in the private local `.env`. Register that exact callback URL in the provider console. Keep the client secret server-side; do not put it in a `VITE_*` variable. `GET /api/v1/auth/providers` reports only whether the provider is configured. On existing local setups, `pnpm auth:keys:generate` adds a missing OAuth transaction encryption key without changing the other generated keys.

For a **disposable local development database only**, `pnpm db:reset` resets the `swiftdrop` database and reseeds it; it rejects remote hosts, other database names and production. Prefer `pnpm db:migrate` to preserve data.

Local demo accounts: `customer@swiftdrop.test`, `merchant@swiftdrop.test`, `courier@swiftdrop.test`, `dispatcher@swiftdrop.test`, `admin@swiftdrop.test`. Their shared **development-only** password is `Local demo passphrase 2026!`. Seed preserves existing accounts and refuses production/non-local databases. The customer fixture can quote and book; the Admin fixture can maintain zones and pricing. Merchant/courier domain profiles and operations screens remain future work. Never expose the seeded database to a public deployment.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm contracts:check
pnpm build
pnpm test:built
pnpm audit --audit-level high
```

Integration tests start and remove their own disposable PostgreSQL and Redis containers through Testcontainers; they never reset the development database. They test transactions, rotation races, stored hashes, CSRF, throttling, current status/role and multiple API instances against the same database. Service/domain line coverage has an 80% gate. Frontend tests use Vitest/React Testing Library and axe on the form DOM. No browser automation is used; layout, contrast and actual browser behavior require the manual checks below.

Contracts live in `packages/contracts/src/index.ts`. Run `pnpm contracts:generate` after changing them; commit `openapi.json` and `src/api.generated.ts` together. `pnpm contracts:check` detects drift. JSON API errors use RFC 7807 with safe field errors and a correlation ID.

## Manual test plan

Start with the commands above. The demo customer can be used for the booking checks; use a new account when checking signup and verification.

1. Submit an empty form, then a short password, a mismatched confirmation, an invalid phone, and a password of 19 emoji (76 UTF-8 bytes). Expect linked errors, focus on the first invalid field and no signup. Use a unique email, a Sri Lankan phone and a unique password of 15+ characters / at most 72 UTF-8 bytes. Submit once and double-click while a request is pending; expect one accepted submission. Inspect the message at `http://localhost:8025`, open the verification link and confirm explicitly. Expect the fragment to clear before submission, `/account` to show verified status, and sign-in to work before confirmation too. Repeat signup with different email casing; expect generic acceptance and unchanged original credentials.
2. Reload `/account`; expect a loading state followed by your restored session. Open `/account` in two tabs and reload both. Use **Check session**; expect active sessions without loops. Sign out in one tab; expect both tabs to clear private content and protected routes to return to login. Sign in in two separate browser profiles; **Sign out everywhere** must invalidate both profiles on their next protected request.
3. Sign in as `customer@swiftdrop.test`, open `/parcels/new`, request the seeded Colombo → Kandy quote for 2 kg and expect LKR 570.00. Check unsupported areas and invalid recipient/weight feedback. Review the details, confirm once, reload `/parcels`, open the booking detail and follow its public tracking link. Repeat a booking as a second customer and confirm the first customer's private detail returns not found. In a signed-out window, confirm tracking shows status/time/town only.
4. Sign in as `admin@swiftdrop.test`; open `/admin/zones` and `/admin/pricing`, add a zone and a future pricing version, and confirm existing quotes retain their snapshot price. Try Admin endpoints as a customer; expect access denied. Sign in with the merchant/courier/dispatcher fixtures and confirm their business workflows remain unimplemented.
5. Inspect browser application storage: expect no access/refresh credentials in localStorage, sessionStorage or IndexedDB. The local refresh cookie must be HttpOnly, SameSite=Strict, Path=/; production additionally requires Secure and the `__Host-` prefix. Auth responses must be `Cache-Control: no-store`. The SPA keeps access tokens in memory only. Never copy token values into shared logs or screenshots. Google stays disabled until server credentials are configured; with credentials, test a new Google customer, profile completion, sign-out/reload, email collision and explicit linking after password proof.
6. Submit five invalid logins for the same address; the next should return 429 with a retry wait. Allow the 15-minute window to expire before continuing. Stop RabbitMQ with `docker compose stop rabbitmq`, book another parcel and confirm booking still succeeds, the relay's `http://127.0.0.1:3101/readyz` returns 503 and the event stays unpublished in `outbox_events`; restart RabbitMQ (`docker compose start rabbitmq`) and confirm `/readyz` recovers and the row gets a `published_at`. If an older local broker already has a direct `swiftdrop.events` exchange, delete it first (`docker compose down -v`) because the topology changed to a topic exchange. Stop Redis/PostgreSQL individually and expect auth/protected requests to fail safely. Use browser offline mode during quote/confirmation; expect readable errors, restored controls and no false success.
7. Repeat booking, tracking, Admin and auth flows at 360px and desktop, 200% zoom, keyboard only, and reduced motion. Check readable errors, visible focus, labels, no horizontal scrolling, and reachable actions. Browser multi-tab Web Locks/BroadcastChannel behavior still needs user verification.

Record browser/device, results and unresolved failures in `handover.md`. No user-run manual verification is claimed.

Dependency advisories and local runtime limitations are recorded in [docs/security/dependencies.md](docs/security/dependencies.md).

## Security and operational boundaries

Email canonicalisation trims and lowercases without stripping dots or plus-tags. Public signup rejects unknown fields and always assigns CUSTOMER. Passwords are never trimmed/normalised; bcrypt cost is 12 with a 72 UTF-8 byte maximum and a local common-password blocklist (provenance in `packages/contracts/PASSWORDS.md`). This limit is a deliberate bcrypt compatibility constraint.

Access JWTs use RS256, fixed issuer/human audience, a trusted configured `kid`, exactly 900 seconds, and no PII. Each protected request checks an indexed database grant, current role/status and family revocation. Refresh secrets are random 32-byte opaque values; only SHA-256 hashes are stored. Rotation locks the user before the family and commits consumption/successor/grant atomically. Reuse commits family revocation before returning 401. A lost successful response or two identical raw-token requests can require re-login; there is no replay grace window. Refresh retains original authentication time and absolute expiry.

Browser mutations require exact configured Origin (validated Referer fallback), JSON and a signed session-bound CSRF token from `GET /api/v1/auth/csrf`. The maintained `csrf-csrf` implementation binds anonymous requests to an opaque HttpOnly context and authenticated requests to the current refresh secret. Cookie rotation renews the CSRF context. Bearer resource routes do not authenticate from cookies. No CORS origin reflection or forwarded-header trust is enabled. Auth mutations fail closed when Redis is unavailable; counters are atomic, expiring and keyed with HMAC rather than raw identifiers. Refresh limits apply to the family across rotations. Request/error logs omit bodies, URLs, headers and exception contents that could contain credentials/PII.

Human access grants only exist in this migration. Future machine grants need their own explicit principal constraint/relations and verifier; do not use human roles for machine/service tokens. Future suspend/reactivate, role-change and password-reset services **must** lock the user and revoke every family/grant in the same transaction; current request guards also reject and revoke detected stale-role/inactive sessions. A request already committed before suspension cannot be undone.

Run `pnpm auth:cleanup` periodically through your deployment scheduler: each invocation deletes at most 500 expired grants and 100 absolutely expired families and their token hashes. Consumed hashes survive until absolute expiry for replay detection. There is no background polling job in this increment.

Production refuses local generated keys, insecure cookies and HTTP origins; demo seed/reset are forbidden there. Provision private RSA keys (3072+ bits), independent strong CSRF/rate HMAC secrets and a map of trusted public PEM keys through an operator secret store. For signing-key rotation, add the new public key to all replicas, switch private key/current `AUTH_KEY_ID`, retain the old trusted public key for at least 15 minutes, then remove it. Keep protected backups of keys separately from database backups; restore and rotation drills remain production work. Back up the PostgreSQL session/revocation state as authoritative security data. Configure HTTPS and a reviewed reverse-proxy topology before exposure; the API currently binds to loopback. First-admin provisioning, durable audit, MFA, recovery/invitations, production mail, full role/resource matrix and load calibration are later-phase gates. Do not describe this increment as production-ready.
