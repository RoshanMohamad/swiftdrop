# SwiftDrop

Customer authentication, booking/tracking, notification-worker, realtime, and event-delivery increments are implemented locally: password signup/login, optional mailbox verification, Google customer sign-in/linking, profile completion, rotating sessions, quotes, booking/history, public tracking, Admin zone/pricing maintenance, staff invitations, all-role suspension/reactivation, operator admin creation, Mailpit booking/status notifications, Socket.IO parcel updates, a standalone outbox relay (`apps/outbox-relay`), and a webhook dispatcher with Admin delivery log/replay (`apps/webhook-svc`; see [docs/messaging.md](docs/messaging.md)). This remains an initial product slice; cross-owner integration, parcel operations, staff/merchant workflows, and production security gates are not complete.

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
pnpm services:provision --service notification-svc
pnpm services:provision --service webhook-svc
pnpm dev
```

Key generation and service provisioning refuse to overwrite existing keys. Run each service provisioning command once per local database; skip them on subsequent starts. Open [the web app](http://localhost:5173/auth/login), [API health](http://localhost:5173/api/health), [readiness](http://localhost:5173/api/ready) or [API documentation](http://localhost:5173/api/docs). Vite proxies `/api` and Socket.IO to the API at `127.0.0.1:3000`. The internal notification API listens separately on `127.0.0.1:3001` and is not proxied by Vite. PostgreSQL uses localhost:5433, MinIO uses localhost:9002 and Redis uses localhost:6380 to avoid other local services. Infrastructure ports bind to loopback only. Verification and parcel notification mail is captured at [Mailpit](http://localhost:8025); Google sign-in requires private development credentials and remains unavailable until configured.

### Test login and email verification

Local verification mail uses SMTP: the API sends through Nodemailer to Mailpit at `localhost:1025` (`SMTP_URL` in `.env.example`). Mailpit captures messages for local testing; it does not forward them to Gmail or another real inbox. Open [Mailpit](http://localhost:8025) to read the verification message.

To test the flow, open `/auth/register`, create a new customer with a unique email, then open its message in Mailpit and follow the verification link. You can also sign in before verifying; verification is optional and does not gate booking. Existing local demo accounts and their development-only password are listed below.

For Google sign-in, create a Google OAuth **Web application** client and put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL=http://localhost:5173/api/v1/auth/google/callback` in the private local `.env`. Register that exact callback URL in the provider console. Keep the client secret server-side; do not put it in a `VITE_*` variable. `GET /api/v1/auth/providers` reports only whether the provider is configured. On existing local setups, `pnpm auth:keys:generate` adds a missing OAuth transaction encryption key without changing the other generated keys.

For a **disposable local development database only**, `pnpm db:reset` resets the `swiftdrop` database and reseeds it; it rejects remote hosts, other database names and production. Prefer `pnpm db:migrate` to preserve data.

Local demo accounts: `customer@swiftdrop.test`, `merchant@swiftdrop.test`, `courier@swiftdrop.test`, `dispatcher@swiftdrop.test`, `admin@swiftdrop.test`. Their shared **development-only** password is `Local demo passphrase 2026!`. Seed preserves existing accounts and refuses production/non-local databases. The customer fixture can quote and book; the Admin fixture can maintain zones and pricing. Merchant/courier domain profiles and operations screens remain future work. Never expose the seeded database to a public deployment.

## Account administration and operator setup

Sign in as Admin and open `/admin/users`. The list includes all five human roles, bounded pagination and role/status filters. Staff invitations remain limited to couriers and dispatchers. Use **Suspend** or **Reactivate** and confirm the named target. Suspension revokes every session and pending account-bound verification/invitation/OAuth action in the same transaction. Reactivation requires fresh sign-in and never restores old credentials. Invited users must accept their invitation; use invitation revocation to block acceptance. Self-suspension is prohibited, and concurrent administration cannot remove the final active admin.

Create the first or an additional Admin from a trusted **interactive terminal** at the repository root:

```sh
pnpm admin:create
```

Enter name, email, Sri Lankan phone, a private password and its confirmation. Password entries are hidden; never pass them as arguments, environment variables or command substitutions. The command uses only `DATABASE_URL` (environment or private `.env`) and the migrated database; it does not require API signing keys, Redis, SMTP or a running API. It creates an active Admin with unverified email and no session. An existing active Admin is an unchanged no-op; any other existing account is a conflict. It does not reset passwords, convert roles or reactivate suspended admins. Ctrl+C/EOF cancels input and restores terminal mode; cancellation before commit rolls back provisioning. A connection lost after commit has an uncertain result: rerun with the same email to reconcile without overwriting credentials. Keep demo seeding restricted to local databases.

For manual acceptance, run the **Start locally** commands above, then:

1. Open `http://localhost:5173/admin/users` as the seeded Admin. In a separate browser profile, sign in as a customer. Suspend that customer and use **Check session** or reload `/account` in the target profile. Expect sign-in to be required and private content to clear on the failed request; existing screens are not remotely erased without a request.
2. Reactivate the customer. Expect the old refresh/access credentials to remain unusable and a new login to succeed. Cancel another confirmation and double-click a pending action; expect no cancelled write and no duplicate submission.
3. Filter each role/status; check incomplete Google profiles, empty pages, previous/next navigation and a filtered page emptied by a status change. Try self-suspension and invited-user activation; expect safe refusal/the invitation workflow. Create a second Admin with `pnpm admin:create` before checking Admin-to-Admin suspension. Do not suspend all test operators.
4. Repeat `pnpm admin:create` with the same email and a different valid password. Expect unchanged credentials; the original password still works. Try an existing customer or suspended Admin; expect a conflict. Check mismatch, short password, hidden entry and Ctrl+C. These operator checks should use a disposable local fixture.
5. Check keyboard-only navigation, confirmation cancellation and restored focus, 360px/desktop widths, 200% zoom and reduced motion. Use browser offline mode during a mutation: expect an error, restored controls and no automatic replay. Restore connectivity and reload before retrying an uncertain result. Non-admin/expired sessions must not reveal the users list. Native confirmations and actual layout still need human verification.

Status changes serialize through PostgreSQL advisory lock `(1396982864, 1)` before ascending user locks. Existing invitation mutations recheck the actor's current session/grant under the actor lock; OAuth callbacks lock the bound user before their action. Future identity writers must preserve these rules. Suspension changes identity access only; it does not cancel courier assignments or alter merchant approval/capacity. Courier invitation activation remains blocked on M06 readiness (handover C-04/X-15). M10 contract/interface review (C-03/C-05), browser acceptance and production recovery/MFA/audit/mail gates remain outstanding.

## Worker service credentials and booking-contact demo

The internal listener accepts only RS256 service JWTs backed by live service-principal and public-key rows. Service credentials are separate from human access grants. The local provisioner creates `notification-svc` with `notifications:lookup`; `webhook-svc` has its own audience/key and `webhooks:config` permission fixture, but webhook configuration lookup is pending M02/M08 contract agreement. The notification route supports persisted `parcel.created` and `parcel.status.changed` events and returns current customer email plus recipient SMS contact; customer suspension does not change an existing booking's contacts. Private keys and signer metadata stay in ignored `.local/services/` with mode `0600`; no endpoint issues service tokens.

## Notifications and realtime

`notification-svc` is independently startable with `pnpm --filter notification-svc dev`. Its current RabbitMQ adapter is intentionally a connectivity skeleton: it opens a readiness connection but does not declare M08-owned topology or consume, acknowledge, reject, or republish messages. `GET /healthz` reports process liveness; `GET /readyz` returns 200 only when PostgreSQL and RabbitMQ are reachable. Local SMTP defaults to Mailpit at `smtp://localhost:1025`; the mock SMS adapter logs only masked phone numbers. Template, contact-lookup and persistence ports are available for the later consumer integration without changing M08 outbox behavior.

The Core API hosts Socket.IO at `/socket.io` with the Redis adapter. Public rooms are `public:<trackingNo>` and receive only status, time, town and sequence. Private rooms are `private:<parcelId>` and recheck current authorization before joining; token expiry and assignment changes evict membership. The customer detail and public tracking pages retain REST snapshots and visibility-aware polling for reconnects, gaps and socket outages. Multi-replica polling requires sticky sessions at the proxy. Courier private-room authorization remains disabled until M06 provides the X-08 assignment read model.

After setup above, create a booking as a customer, then run:

```sh
pnpm services:demo
```

The CLI signs a five-minute event-bound token in memory, reads the newest persisted booking event, calls `127.0.0.1:3001` directly, and prints masked email/SMS summaries without printing the token. Manage credentials with `pnpm services:status --service notification-svc`, `pnpm services:rotate --service notification-svc`, and `pnpm services:revoke --service notification-svc [--key-id <id>]`. Rotation keeps the previous public key valid for ten minutes; during that window, `pnpm services:demo --key-id <old-key-id>` exercises the old key, after which it is rejected. Key or principal revocation takes effect on requests that begin after commit. Do not run revoke against a shared/non-disposable environment.

Manual worker check: (1) open `http://localhost:5173/auth/login`, sign in as the customer, and create a booking; (2) run `pnpm services:demo` and expect success with only event/parcel/tracking identifiers and masked contacts; (3) request the same path through `http://127.0.0.1:3000/internal/v1/notifications/events/<eventId>` and `http://localhost:5173/internal/v1/notifications/events/<eventId>` and expect 404; (4) rotate, run the demo with `--key-id <old-key-id>` and expect success during overlap; rerun after ten minutes and expect 401; (5) revoke the principal and repeat the demo, expecting 401; (6) repeat existing customer login and Admin smoke checks. Also check malformed IDs (400), missing/invalid/human credentials (401), missing scope (403), mismatched/unavailable events (404), and stopped database (503). Browser layout does not change; responsive and manual browser acceptance for existing screens remains outstanding. The fake worker demo does not establish M09 provider delivery or M08 webhook integration.

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

Human access grants only exist in this migration. Future machine grants need their own explicit principal constraint/relations and verifier; do not use human roles for machine/service tokens. Suspend/reactivate now locks the user and revokes every family/grant in the same transaction; future role-change and password-reset services **must** preserve that rule; current request guards also reject and revoke detected stale-role/inactive sessions. A request already committed before suspension cannot be undone.

Run `pnpm auth:cleanup` periodically through your deployment scheduler: each invocation deletes at most 500 expired grants and 100 absolutely expired families and their token hashes. Consumed hashes survive until absolute expiry for replay detection. There is no background polling job in this increment.

Production refuses local generated keys, insecure cookies and HTTP origins; demo seed/reset are forbidden there. Provision private RSA keys (3072+ bits), independent strong CSRF/rate HMAC secrets and a map of trusted public PEM keys through an operator secret store. For signing-key rotation, add the new public key to all replicas, switch private key/current `AUTH_KEY_ID`, retain the old trusted public key for at least 15 minutes, then remove it. Keep protected backups of keys separately from database backups; restore and rotation drills remain production work. Back up the PostgreSQL session/revocation state as authoritative security data. Configure HTTPS and a reviewed reverse-proxy topology before exposure; the API currently binds to loopback. Operator admin creation and local staff invitations are implemented. Durable audit, MFA, recovery, production mail, the full role/resource matrix and load calibration remain later-phase gates. Do not describe this increment as production-ready.
