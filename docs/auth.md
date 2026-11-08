# SwiftDrop: authentication-first implementation plan

Status (6 November 2026): customer authentication, booking/parcel baseline and local RabbitMQ relay are implemented in this working tree. M01 Sprint 2 account administration/operator bootstrap and Sprint 3 service identity + notification booking-contact lookup are implemented locally on `umair-dev`, pending peer contract/schema review, worker-owner integration and manual acceptance; courier activation remains blocked on M06 readiness. No M08 webhook delivery or M09 live notification delivery is claimed. Full Sprint 0/1 exits and production gates remain incomplete. See [README.md](../README.md) and [handover.md](../handover.md) for exact setup and evidence.
Prepared and reconciled with the corrected report: 29 October 2026.

> **Ownership note (29 October 2026):** role letters A1–E2 in this document are legacy layer-based roles. Ownership was re-divided into ten vertical slices M01–M10; translate letters with [plan.md §4.6](../plan.md#46-legacy-ae-crosswalk). Where they differ, plan.md §4.1 wins (identity, auth UI and Admin users are all M01; merchant machine access is M02).

## 1. Authority, scope and delivery order

The product source of truth remains [the Design Doc](../SWIFTDROP_DESIGN_DOCUMENTATION.md), especially §§2, 3.2–3.5, 4, 7.2, 7.4, 9 and 10. The delivery source of truth remains [plan.md](../plan.md), especially FR-A1–A6, FR-M1–M5, FR-F1/F2/F5/F7, NFR-1–4/12–16 and Sprints 0–4. This document refines those corrected requirements into implementation work. The [corrected report](../output/pdf/SwiftDrop_Design_Report_Corrected.pdf) presents the same baseline; this plan preserves MoSCoW priorities, ten-person ownership and sprint sequence. The customer-authentication part of Phase B is implemented; it does not complete the parcel/booking/tracking and relay work in the broader sprint. Phase A is a minimum prerequisite foundation, not the full platform exit.

Start with the minimum Sprint 0 foundation, then deliver customer authentication as the first real vertical slice in Sprint 1. Staff account administration and merchant onboarding follow in Sprint 2; Google sign-in and merchant machine tokens remain in Sprint 3. Design contracts and security boundaries for all of them at the beginning. The later parcel, dispatch and event work in the original plan continues alongside this work.

Labels used below:

- **Baseline**: explicitly required by the existing plan or Design Doc.
- **Completion detail**: needed to safely implement an existing requirement, such as refresh-family storage required by DD §9.1, cookie/CSRF safety or staff bootstrap. Email verification is an optional extension, not a baseline booking requirement.
- **Security extension**: a reasoned addition for the requested enterprise security level. Track it as an additive issue and contract/schema change under plan §§7.5–7.6; do not silently turn it into an original MoSCoW requirement.
- **Decision needed**: the documents leave a choice open, or following an existing choice prevents a production security claim. These do not block writing contracts or local implementation that is independent of the decision.

Use the corrected Node.js 24 LTS runtime line and keep the modular monolith, pnpm workspaces, Express/TypeScript, React 18/Vite, PostgreSQL/Prisma, Redis, RS256 JWTs and bcrypt cost 12. Do not introduce a separate identity service, hosted authentication dependency, Supabase, multi-role accounts, organisation membership or a paid provider.

“Enterprise grade” is an acceptance target, not a certification. A local demo completing baseline flows is distinct from passing the production gates in §12.

## 2. Authentication methods and account boundaries

| Actor | Authentication and provisioning | Authorisation after authentication | Classification / delivery |
| --- | --- | --- | --- |
| Customer | Public email/password registration/login; Google OIDC as an additional method | Own resources; active account and required profile, with no baseline email-verification booking gate | Baseline Sprint 1; Google Sprint 3; verification is an optional extension |
| Merchant person | Dedicated business registration creates a `MERCHANT` user and a `PENDING` merchant profile atomically; email/password dashboard login | Own profile and approval status; API client creation and order access require `APPROVED` | Baseline; Sprint 2 |
| Courier | Admin provisions `COURIER`; one-use invitation lets the courier set a private password | Assigned parcels only; no public staff signup | Baseline + invitation security extension; Sprint 2 |
| Dispatcher | Admin provisions `DISPATCHER`; invitation and password login | Create/update/cancel operational parcels, assign/reassign, workload and reports; cannot administer users, approve merchants or replay webhooks | Baseline + invitation extension; Sprint 2 |
| Admin | First admin provisioned by an operator command; subsequent provisioning through the same operator procedure initially | Inherits all Dispatcher capabilities plus configuration, approval and Admin-only webhook replay | Bootstrap completion detail; no public admin signup |
| Merchant software | OAuth 2.0 `client_credentials` using a confidential client ID/secret | Only granted order scopes and owning approved merchant | Baseline; credential management Sprint 2, token endpoint Sprint 3 |
| Recipient / visitor | No authentication; tracking number lookup | Public status, time and town only | Baseline; never create guest sessions or expose protected fields |

There are exactly five persisted roles: `CUSTOMER`, `MERCHANT`, `COURIER`, `DISPATCHER`, `ADMIN`. Recipient is a guest actor, not a sixth role. One role per account remains a database invariant. Reject client-supplied `role`, `status`, `merchantId`, approval or privilege fields in public signup DTOs. Assign the role on the server from the chosen registration endpoint.

Use one human login endpoint and route users using the server's current role. Separate login screens may explain the audience but must not implement independent password stores. Google creates or authenticates customer accounts only in this scope; it must not grant merchant or staff access based on an email domain. Existing merchant/staff email collisions must not create or convert accounts.

No multi-user merchant organisation is implied: DD §4 models one merchant owner. An existing customer cannot become a merchant by changing a signup field. Initially require a separate email/account; any role conversion needs a later, explicit product decision and audited migration.

### 2.1 Additional security flows

| Flow | Why it belongs | Delivery |
| --- | --- | --- |
| Verification and resend | Optional mailbox-ownership assurance; corrected DD Table 4 removes the unsupported booking precondition | Security extension, sized Sprint 1–2 issue; never blocks baseline booking/onboarding |
| Forgot/reset/change password | Avoid manual password handling and support credential compromise recovery | Security extension, sized Sprint 1–2 issue |
| Invite/activate/resend staff invitation | Admin creates the account without knowing or emailing its password | Security extension, Sprint 2 |
| Current/all-session logout, session list and revocation | Make stolen session recovery and suspension meaningful | Logout is baseline implementation detail; management UI is extension, Sprints 1–2 |
| Explicit Google linking and setting a password on a Google-only account | Support both customer methods without email-based account takeover | Completion detail for safe linking; additive endpoints, Sprint 3 |
| TOTP MFA, recovery codes and recent-authentication checks | Protect privileged access and credential management | Security extension, Sprint 4 before production gate |

Proposed production policy: require MFA for admins and dispatchers, and for merchant owners before API credential or webhook-secret management. Offer it to customers and couriers. During a baseline demo without MFA, explicitly record that limitation. TOTP is compatible with free/OSS operation but is phishable; WebAuthn/passkeys are a later improvement. SMS is a mock adapter in this project and cannot be used as a real security factor.

Do not add SAML, enterprise OIDC federation, Microsoft/Facebook login, passwordless email links, phone login, SMS OTP, OAuth password grant, impersonation or machine refresh tokens to the initial scope. They are not required by the current product model.

## 3. Forms, screens and interaction contracts

The routes below are proposed frontend contracts, not existing pages. API paths are in §7. Forms use shared Zod rules, server validation and the generated API client. Password confirmation is checked in the UI and is not persisted. Do not collect delivery addresses in authentication forms.

| Proposed screen | Fields and actions | Expected states and boundaries |
| --- | --- | --- |
| `/auth/register` | Full name, email, Sri Lankan phone, password, confirm password; link to merchant registration | Customer only; generic accepted result and login path; optional verification instructions only when extension enabled; duplicate email never overwrites an account |
| `/auth/login` | Email, password, reveal-password control, forgot-password link; Google button when configured | Invalid credentials are generic; after valid credentials handle required profile/onboarding, enabled MFA or role home; optional verification cannot gate baseline business access; no role selector |
| Optional `/auth/verify-email` | Token from email; explicit Confirm action; resend email form when needed | Loading, verified, expired, invalid, already-used and resend cooldown; GET must not consume a token |
| `/auth/forgot-password` | Email | Same acceptance message for known, unknown, Google-only and suspended accounts |
| `/auth/reset-password` | One-use token, new password, confirmation | Expired/used token recovery; success returns to login and invalidates existing sessions |
| `/merchant/register` | Contact full name, email, Sri Lankan phone, password/confirmation, business name, business registration number | User + merchant created in one transaction; approval gates credentials/orders; optional email verification does not gate baseline onboarding |
| `/merchant/onboarding` | Status and permitted profile details; sign out | `PENDING` and `REJECTED` have clear copy; no key creation or order data; approved status comes from server |
| `/auth/accept-invite` | Invitation token, password/confirmation; name/email/role read-only | Cannot change role/email; expired/used/revoked invitation has a resend path; activation is atomic |
| `/admin/users` | Create courier/dispatcher: name, email, phone, role; courier profile fields defined with C2; suspend/reactivate confirmation | Allowed role enum is courier/dispatcher only; prevent accidental self-suspension and removal of the last active admin |
| `/admin/merchants` | Approve/reject business; rejection reason | Admin-only; stale status conflicts shown; merchant cannot approve itself |
| `/settings/security` | Change password; Google link; set local password where eligible; active sessions and revoke actions | Require recent authentication for sensitive actions; mask identifiers; no raw tokens or secrets |
| `/auth/google/result` | Callback success/failure display, retry | API owns Google callback and redirects here; page receives only safe result codes, never credentials |
| `/auth/complete-profile` | Missing customer name/phone after Google signup | Restricted session; no editable role/email/status; business access remains blocked until completion |
| `/merchant/api-clients` | Label, allowed scope checkboxes, create; rotate/revoke confirmation | Secret visible once after successful create/rotate; copy button feedback; refresh never retrieves it |
| `/auth/mfa` | TOTP code or recovery code | Short-lived challenge; attempts/expiry; no normal access token before completing required MFA |
| `/settings/security/mfa` | Enrol QR/manual key, confirmation code, recovery codes; regenerate/disable controls | Factor becomes active only after code confirmation; fresh authentication; secrets never sent to analytics |
| Public `/track/:trackingNo` | Tracking number lookup | No forced login; unknown result and throttling do not expose private parcel data |

All forms must have labelled controls, correct `autocomplete` (`email`, `current-password`, `new-password`, `one-time-code`), keyboard submit, visible focus, linked field errors and a live status/error region. Allow password-manager fill and paste. Disable duplicate submissions while pending and restore controls after errors. Show cooldown/`Retry-After` without trapping keyboard focus. Never put a password into URL parameters, navigation state, browser storage or analytics.

Check 360 px and desktop layouts, long validation messages, zoom, reduced motion and slow/offline networks. Preserve non-sensitive form input on transient errors; clear secrets on success or leaving the security screen. Scaffold FR-F2's Google button with an unavailable explanation in Sprint 1; enable it only when the real backend flow lands in Sprint 3. When Google is disabled or unavailable, keep password login usable and explain availability. Service-worker caches must exclude auth/security responses, secrets and token endpoints.

## 4. Security policy and lifecycle

### 4.1 Passwords and identifiers

Keep **bcrypt cost 12** as required. Proposed password policy: at least 15 Unicode code points, spaces and Unicode allowed, no mandatory character classes or scheduled password expiry. Reject commonly compromised passwords using a maintained local blocklist so signup does not send passwords to an external service. Cap request bodies and expensive hash operations. Use asynchronous bcrypt and run a dummy comparison for unknown/passwordless accounts to reduce obvious timing differences. Calibrate latency under concurrent attempts before release. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Reject passwords exceeding **72 UTF-8 bytes** before hashing, across registration, reset, invitation and change-password flows. Never silently truncate, trim or normalise passwords. Explain the byte limit for Unicode input. This preserves the specified bcrypt design but cannot promise support for all 64-character Unicode passphrases. OWASP prefers Argon2id for new systems; adopting it would require a documented change to the baseline rather than silently substituting it. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Define a single documented email canonicalisation rule in contracts and enforce a database uniqueness constraint against it. Proposed application policy: trim and lowercase email for this system, retaining display input separately only if needed; do not strip dots, plus-tags or infer Google identity from the email. Do not modify existing credentials when a duplicate signup arrives. Validate names/business numbers as bounded text and phones using the Design Doc's Sri Lankan rules. Provider claims and invitation payloads are also untrusted input.

### 4.2 Human access tokens and live account checks

- Issue RS256 access JWTs valid for exactly 900 seconds. Domain claims remain user ID (`sub`), one `role` and random `jti`; add standard protocol claims `iss`, `aud`, `iat`, `exp`. No email, phone, name, address or raw session secrets.
- Verify algorithm allowlist, signature, fixed issuer, human audience, expiry, required claims and role enum. Resolve `kid` against configured trusted keys only; never fetch a URL supplied in a token header. Rotate signing keys with overlap for existing 15-minute tokens. [JWT best current practices, RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html)
- Keep access tokens in browser memory and send `Authorization: Bearer`. Reload obtains a new token via refresh. Never persist access tokens in localStorage, sessionStorage or IndexedDB. Authentication state is `loading`, `anonymous`, `restricted`, `MFA required` or `authenticated`; do not briefly render protected content before bootstrap finishes.
- Maintain a compact server-side access-grant record keyed by `jti`, related to user/session family, expiry and authentication assurance. Check the grant, current user status and current role on protected requests. This enables immediate revocation while retaining the required JWT format. A role mismatch invalidates the token; it cannot grant stale privileges.
- PostgreSQL is authoritative for this first implementation. Check it using indexed queries; do not cache positive authorisation across requests initially. Redis holds rate-limit counters, not the only copy of account status. Shared state keeps API replicas stateless at the process level. Expired grants are removed in bounded cleanup batches. This costs a small indexed lookup per protected request; measure before adding a cache with revocation complexity.
- State-changing business transactions must recheck relevant account/merchant status inside their transaction. Requests already committed before suspension cannot be undone by token revocation; document this boundary and serialize sensitive credential/approval actions against status changes.

### 4.3 Refresh token families, cookies and concurrency

Use cryptographically random opaque refresh tokens (at least 32 random bytes), hashed with SHA-256 for indexed lookup. High-entropy tokens do not need slow password hashing. Store family relationships and consumed-token hashes; a current-token-only table cannot detect reuse.

On refresh, in one database transaction lock/check the session family and token, validate user eligibility and idle/absolute expiry, consume the old token exactly once, insert its successor, register a new access grant and commit. Carry forward the original authentication/MFA assurance timestamps; refresh never counts as recent credential proof. Return credentials only after commit. Any subsequent presentation of a consumed token revokes that whole family and its access grants; commit this revocation before returning an error, rather than rolling it back by throwing inside the transaction. Unknown/malformed tokens get generic failure. Retain consumed hashes until family absolute expiry to preserve replay detection. Refresh rotation/replay protection follows [OAuth security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).

Proposed configurable expiry defaults, not values from the original plan:

| Session | Idle limit | Absolute family limit | Sensitive action freshness |
| --- | --- | --- | --- |
| Customer / merchant dashboard | 7 days | 30 days | Last 5 minutes |
| Courier / dispatcher / admin | 12 hours | 24 hours | Last 5 minutes |

Idle time advances on successful refresh, absolute expiry never slides. No “remember me” control until it has a defined policy. Explicit logout revokes the current family; logout-all, password reset, suspension and role changes revoke every family/access grant for that user. Reactivation does not resurrect revoked credentials. Password changes revoke other sessions and replace the current session after fresh authentication. UI clears its token/query caches even if logout fails, explains an unconfirmed server logout and offers retry.

Production refresh cookie: host-only `__Host-swiftdrop-refresh`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain`; expiry bounded by the server's family lifetime. Do not parse it in JavaScript or accept refresh tokens in JSON/query strings. Clear it with matching attributes. Use a distinct unprefixed insecure cookie only for explicit local HTTP development; reject that configuration in production.

The typed API client must single-flight refresh within a tab and coordinate same-origin tabs using Web Locks plus non-persistent BroadcastChannel notifications. After receiving the lock, refresh using the current browser cookie, never a saved raw token. Older supported browsers without cross-tab locking use a documented re-login fallback on a rotation race. Strict reuse detection stays enabled: concurrent presentation of the same old token revokes the family, even if benign. A lost refresh response can therefore require re-login; do not retry a consumed token or add an undocumented grace window.

Refresh only once after an eligible `401`; never loop on `403`, account suspension or validation errors. Retry a business mutation only if the API contract and idempotency key make it safe. On terminal refresh failure, clear private cache and return to login with an allowlisted in-app return path. Courier offline queues retain no credentials, remain scoped to their original user and require reauthentication as that user before sending; never replay one courier's queue as another user.

### 4.4 CSRF, CORS, proxy and redirect boundaries

Deploy SPA and API on one origin through Nginx; use the Vite API proxy locally. For browser auth mutations, enforce exact configured Origin (validated Referer fallback), non-simple JSON requests and a session-bound CSRF token in `X-CSRF-Token`. Use a maintained synchronizer/signed implementation, including an anonymous pre-auth context for login/signup; bind or renew it after login. `GET /api/v1/auth/csrf` returns the token with `no-store`. Authentication cookies stay HttpOnly. CSRF rejection occurs before any state change. `SameSite` is additional protection, not the sole control. [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Bearer-only resource APIs must not silently fall back to refresh-cookie authentication. Machine `/oauth/token` uses confidential-client authentication rather than browser cookies. If cross-origin web development is explicitly enabled, allow exact origins with credentials; no wildcard or origin reflection. Restrict `trust proxy` to the actual proxy topology, so attackers cannot spoof rate-limit identity using `X-Forwarded-For`. Build email and OAuth redirects from configured origins, never untrusted Host headers. Allow only known relative return routes; reject protocol-relative and external redirect targets.

### 4.5 Verification, recovery and invitations

Use purpose-bound, random, single-use tokens stored as hashes with user ID, expiry, consumed/revoked timestamps and a generation/version. Proposed expiry: verification 24 hours; reset 30 minutes; staff invitation 24 hours; OAuth transaction 10 minutes; MFA challenge 5 minutes. Separate token purposes; a reset token cannot verify email or activate an invite.

Email verification is a separately sized extension. The baseline accepts an active password-authenticated customer for booking whether `email_verified_at` is null or populated. Merchant approval, rather than mailbox verification, gates baseline machine access. Do not wire `requireVerifiedEmail` into baseline booking/onboarding middleware or change that policy through an implicit environment flag.

When the extension is delivered, verification GET renders a confirmation page and POST consumes its token atomically. Show a nonblocking verification status/resend action; success updates account metadata and invalidates other outstanding verification tokens. A future policy that restricts business access would require an explicit product/contract change across DD, plan and report. Google still validates its provider email claim under §4.6; this does not impose mailbox verification on password accounts.

Recovery responses and signup/resend acceptance should not disclose whether an address exists. Apply limits before email delivery; resend invalidates prior tokens of the same purpose, without allowing unauthenticated requests to change an account's password/status. Password reset does not log the user in, bypass MFA, unsuspend an account or change its role. Existing Google-only accounts receive Google sign-in guidance rather than an unsolicited local password. [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

Invitation acceptance verifies the locked account is still invited, consumes the token, sets the private password, marks email verified by demonstrated mailbox control and activates the account in one transaction. If required courier profile fields cannot be supplied, do not create a partially usable courier; coordinate the DTO with C2. Admins can revoke/resend invitations but cannot retrieve passwords or silently disable MFA. Staff lost-password support uses the same recovery path.

Local M01 Sprint 1 implements dispatcher invitation acceptance and Admin invitation management on `umair-dev`: `GET/POST /api/v1/admin/users`, `POST /api/v1/admin/users/{id}/invitation`, and `POST /api/v1/auth/accept-invite`. Invitations are 24-hour, single-use records with a stored SHA-256 token hash; creation and activation are transactional, resends rotate tokens after a one-minute cooldown, and SMTP runs after commit. Dispatcher acceptance sets a private password and activates the user; login remains a separate step. Courier invitations can be created, but acceptance returns setup-pending without consuming the invitation until M06 agrees and supplies the required profile/readiness contract. The additive table currently targets the repository's single `packages/db/prisma/schema.prisma`; M10 review is pending under handover C-03. This is branch-local evidence, not an integrated or production-ready claim.

Local M01 Sprint 2 adds all-role `GET /api/v1/admin/users` (nullable name/phone for incomplete Google customers) and strict `PATCH /api/v1/admin/users/{id}/status` with `{ status: "ACTIVE" | "SUSPENDED" }`. Only active/suspended accounts can transition; invited accounts use invitation acceptance/revocation. The status response is a safe admin user summary; existing staff creation/invitation responses retain their staff-only shapes. Self-suspension is rejected. Status writes and operator creation share PostgreSQL transaction advisory lock `(1396982864, 1)` before actor/target user locks in ascending ID order; final-admin checks therefore serialize. Mutations recheck actor role/status and the original live session/grant inside that transaction. Middleware supplies `res.locals.user`, `authFamilyId` and `authGrantId`; this is the implemented X-02 interface, pending M10 review under C-03.

Actual transitions atomically revoke all families/grants and outstanding account-bound verification/invitation/OAuth actions; consumed refresh hashes remain for replay detection. OAuth callbacks acquire user locks before action locks. Reactivation requires a password hash or a supported customer Google identity and never revives old sessions. A repeated request for the current non-invited status is an unchanged success. Suspended Google-only customers may reactivate without inventing a local password. Admin responses remain bearer-only and `no-store`; browser mutations require Origin/JSON/CSRF protections. Protected reads refresh at most once after 401; terminal refresh failure clears private UI state locally and across tabs. Mutations are never automatically replayed.

The operator-only `pnpm admin:create` command uses an interactive terminal, hidden password/confirmation and existing registration validation/bcrypt-12. It needs only the migrated database and private `DATABASE_URL`, creates an active Admin without verification/session issuance, preserves existing active Admin credentials, and refuses every conflicting account state. It cannot convert roles, reset passwords or unsuspend accounts. Cancellation before commit rolls back; uncertain commit outcomes are reconciled by rerunning the same email. No schema migration, new dependency or public Admin-creation endpoint is introduced. This is local implementation, not peer-reviewed/merged Sprint 2 acceptance; C-03/C-05 review, C-04/X-15 courier readiness and the production gates in §12 remain open.

Keep link tokens out of proxy/access logs, analytics, traces and error reports. Email links should put the opaque token in the frontend URL fragment; read it into memory, replace the URL immediately and submit in the POST body. Token pages load no third-party assets and set `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Email scanners visiting a link must not consume it.

When the sized recovery/verification extension lands in Sprint 1–2, use Mailpit through a narrow adapter. Baseline registration/login/booking must not depend on verification mail or worker availability. Persist token state before sending; transient SMTP failure leaves the account intact and permits rate-limited resend. Return generic acceptance, record only a safe delivery-failure code and correlation ID. Before production use of these extensions, reuse the notification worker with a separate restricted security-mail queue/binding (`auth.mail.ready`), declared only when that extension is implemented. Baseline notifications.q remains bound only to parcel.created and parcel.status.*. Use the transactional outbox and confirmed handoffs: events contain only an opaque mail-job ID, never the raw reset/verification token or PII. Any secret-bearing mail job needs encrypted short-lived storage, a separate `security-mail:read` service scope bound to the claimed job, and cleanup; token validation continues to store only its hash. Test retries and stale-job cancellation. Do not claim email delivery is guaranteed in the initial synchronous demo adapter.

### 4.6 Google OIDC and account linking

The backend owns authorization-code exchange, S256 PKCE verifier, state and OIDC nonce. Use a maintained OIDC library; no handwritten JWT/JWKS or PKCE implementation. Verify Google signature/trusted discovery keys, issuer, audience/authorized-party as applicable, expiry, nonce and a verified email. Request only `openid email` plus any explicitly needed profile scope. Match identity by immutable `google_sub`, never by email alone. Google's `sub` is its stable account identifier. [Google OIDC documentation](https://developers.google.com/identity/openid-connect/openid-connect)

Preserve DD §7.4's short-lived signed transaction cookie, but store an opaque transaction reference there and keep verifier/nonce server-side. The transaction cookie is `HttpOnly`, `Secure`, host-only, `SameSite=Lax` for Google's cross-site top-level GET callback; **the refresh cookie remains Strict**. Bind the transaction to the initiating browser and consume it once. Missing/mismatched/replayed state fails closed. Do not rely on a Strict refresh cookie being sent on the callback.

Find existing users by `google_sub`; otherwise create a verified `CUSTOMER` if that email is unclaimed. If the email belongs to any existing account, create no second identity and do not auto-link. Ask the user to sign in through the existing method, then explicitly link Google from settings with fresh proof of that method. Store the initiating user and link intent server-side; recheck on callback. A Google-only customer can set a local password after fresh Google authentication and verified mailbox confirmation; a stolen old session alone is insufficient. Keep current email unchanged if Google later reports a different address; use `sub` for login.

For Google signup, collect any required name/phone missing from validated provider data through a restricted profile-completion screen before business access. The API callback issues the normal refresh cookie and redirects to a clean same-origin result route; SPA refresh issues its own SwiftDrop access token. Fresh Google reauthentication needs a new bound transaction plus a recent validated `auth_time` claim, which must be enabled/requested in the Google project. Consent or account selection alone does not prove recent credential entry. If freshness cannot be established, require another enrolled factor or refuse the sensitive action; do not substitute token issuance time. Never expose Google access/ID tokens, authorization codes or PKCE material to the SPA or retain Google refresh tokens. Cancelled consent, provider outage and missing configuration produce safe, retryable errors.

### 4.7 MFA and recent-authentication extension

Use a maintained TOTP library. Encrypt factor secrets at rest with a separate versioned key, show enrolment material once, confirm a code before enabling, prevent reuse of an accepted TOTP time step and keep the clock window narrow. Issue random high-entropy recovery codes once, store only hashes and consume each atomically. A password reset must leave MFA enabled. [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

After the primary credential, accounts with required/enabled MFA receive only an opaque limited challenge, not normal access/refresh credentials. If enrolment is mandatory and absent, permit only the enrolment path after the primary proof. Store completion/reauthentication times and assurance on server-side grants. API secret creation/rotation, password/factor changes and privileged account changes check recent proof on the server. Recovery-code login should require factor repair before credential management. No indefinite “trusted device” bypass.

Lost-factor recovery needs a documented operator procedure with independent identity verification, an audit trail and notification. Protect the final active administrator from accidental suspension; maintain operator access for recovery. Do not implement an unaudited admin “disable MFA” button or email-only MFA bypass. The operational identity-verification procedure remains a production decision in §12.

### 4.8 Rate limiting and secure failures

Baseline FR-A6 remains a Should item delivered fully in Sprint 3. Include basic bounded throttling from the first exposed auth route; do not expose unthrottled bcrypt or email endpoints while waiting for that sprint. Proposed initial limits, subject to measured tuning:

| Surface | Limits / response |
| --- | --- |
| Login | 5 failed attempts/account/15 min and 30 attempts/IP/15 min; bounded temporary backoff, no permanent attacker-triggered account lock |
| Signup | 5/IP/hour; cap body size before parsing/hash work |
| Verify/resend/reset email | 3/address/hour, 10/IP/hour, minimum 60 s resend interval; generic acceptance for address-specific suppression |
| Refresh | 30/family/minute and 120/IP/minute; family validation still happens on accepted requests |
| OAuth machine token | 30/client/minute plus 120/IP/minute; reject unknown scopes and unsupported grants |
| Google / MFA / activation | Bound starts, callbacks and verification attempts by IP plus transaction/account; max 5 attempts per MFA challenge |

Use Redis atomic counters with expiry; hash/HMAC account identifiers in keys and bound their cardinality. Use coarse IP limits before expensive lookup/hash work. For unavailable Redis on auth mutation endpoints, fail closed with retryable `503`; public tracking and unrelated healthy reads need not fail. Test that shared NATs and normal multi-tab refresh fit the policy. Never log raw password, cookies, bearer tokens, Basic credentials, codes, recovery material or client secrets. Apply redaction to nested fields and query strings at both proxy and API. Counters and audit events are bounded and have documented retention.

## 5. Authorisation and merchant machine access

Define separate server-side principal variants: human `{ kind: 'user', id, role }`, machine `{ kind: 'merchant-client', clientId, merchantId, scopes }`, and internal service `{ kind: 'service', serviceId, scopes }`. Keep the original `req.user {id, role}` contract for human routes; add a separate machine principal for merchant API routes. A type discriminator comes from validated server logic, never request input. `authenticate`, `requireRole`, `requireScope`, principal-kind and merchant-status checks have separate responsibilities. `requireVerifiedEmail` belongs only to an explicitly approved future policy, never the baseline booking/onboarding flow.

Apply the corrected DD Table 3: Admin inherits Dispatcher operations; only Admin can replay failed webhooks. Merchant machine and internal service principals never inherit human roles. Every protected object query includes its owner/assignment/merchant scope, including lists, counts, exports, receipts, signed media URLs and socket room joins. A foreign customer/courier/merchant object identifier returns 404. Valid identity with a wrong capability returns 403; absent/invalid authentication returns 401. Default deny unknown roles/scopes. UI guards are navigation convenience and never the authorisation boundary.

Merchant profile states remain exactly `PENDING`, `APPROVED`, `REJECTED`; user suspension is a separate state, not a fourth invented merchant approval status. Pending/rejected merchants can sign in to restricted onboarding/status screens without a mailbox-verification prerequisite, but cannot create credentials or use orders until approved. Recheck owner active status, merchant approval and client revocation on each machine request and token issuance, so suspension/rejection/revocation also invalidates previously issued machine tokens operationally.

`POST /oauth/token` stays outside `/api/v1`, as explicitly specified. It accepts `application/x-www-form-urlencoded`, `grant_type=client_credentials`, OAuth HTTP Basic client authentication and optional space-separated scope. Return `access_token`, `token_type: Bearer`, `expires_in: 900`, granted `scope`, with `no-store`. No cookie or refresh token is issued. Use standard OAuth error responses on this endpoint; other JSON APIs retain the project's RFC 7807 format. This explicit protocol exception prevents incompatible merchant SDK behaviour. [OAuth 2.0 client credentials, RFC 6749 §4.4](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4)

Machine RS256 tokens have a distinct audience/validation path, `sub` bound to the client identifier, `jti`, standard timestamps and only granted scopes. Never fabricate an admin/user role for a machine token. Bind merchant ownership by the database client mapping, not a submitted merchant ID. Human tokens cannot substitute for machine tokens in API-only order operations, and machine tokens cannot access user/admin dashboards.

Generate each client secret using at least 32 random bytes, encode safely and store only a hash (SHA-256 is appropriate for a uniformly random high-entropy secret; bcrypt-12 remains mandatory for user passwords). Show the raw secret once, only to the authorised owner or explicit admin capability in DD Table 3. Initial rotation atomically replaces the hash and revokes old client access grants immediately; no overlap period unless later designed. Warn about integration interruption before confirmation. Lost secret means rotation. Revocation is idempotent. Transaction/response loss after creation means the unrecoverable secret must be rotated, never fetched from storage.

Credential management is owner-scoped, rate-limited, audited and protected by recent authentication/MFA under the proposed production policy. Webhook HMAC signing is outbound message authentication, not a login method: retain DD §9.3's encrypted signing secret, HTTPS/SSRF checks and timestamp verification. Do not reuse JWT signing keys or client-secret hashes as webhook keys.

Socket.IO must apply the same current account/ownership checks and disconnect or reauthorise on token expiry/revocation. Public rooms `public:<trackingNo>` contain only status/time/town/sequence. Private rooms `private:<parcelId>` require current owner/staff/courier authorisation and a separate projection. Reassignment removes the old courier subscription; expiry/revocation removes private access. Reconnect obtains an authorised snapshot. Offline operations keep the original user ID, stable operation key, expectedVersion, proof-upload dependencies and per-parcel order. Reauthenticate as the original user, refresh the server snapshot and replay; foreign/reassigned 404 and stale/illegal 409 stop for review. Never silently update expectedVersion. Backend returns the saved response for an accepted same-key/body operation; mismatched body returns 409. Queue local work without credentials; do not extend token lifetime. Recipient name is required for delivery; a private photo is optional.

Internal integrations also need credentials, but no human-facing forms: give API/workers distinct database and RabbitMQ identities with minimum required permissions, a dedicated broker vhost/queue policy, non-public Redis access/credentials and restricted MinIO service credentials. Use secure transport whenever traffic leaves a trusted local container network. Frontend access to protected MinIO objects uses short-lived signed URLs, never storage credentials. Keep Mailpit/management consoles local in development; protect or disable production management/API-documentation surfaces. For the HTTP lookups explicitly required by corrected DD §5.3, provision distinct short-lived service JWTs with a trusted issuer, per-principal audience, live public-key records and least-privilege `notifications:lookup` or `webhooks:config` scopes. The API has public keys only; workers sign locally. Tokens require a service kind, subject, audience, issuer, key ID, token ID, issue/expiry times, event/resource claims and scope; expiry is at most five minutes with 30 seconds clock tolerance. Reject token-supplied key URLs, human-key reuse and scope escalation. Check principal/key status in the database for every request without a positive authorization cache; DB failure denies access. Rotation overlaps old/new public keys for ten minutes, with immediate revocation override. Bind requests to trusted persisted event/parcel state and return only required fields. Service tokens cannot call human or merchant routes, and human/client tokens cannot call internal lookups. Platform DB/broker credentials remain distinct. No public/general-purpose service-token endpoint is used.

Current local X-03 implementation on `umair-dev` adds `service_principals`/`service_public_keys` to the shared Prisma schema with one additive migration, generated OpenAPI/client definitions, a separate loopback internal app (`INTERNAL_PORT`, default 3001), and `GET /internal/v1/notifications/events/{eventId}`. This route currently supports only persisted `parcel.created` records; it compares signed event/parcel claims with the outbox row's event ID/type/aggregate/payload and reads current booking contacts. The response is exactly `eventId`, `parcelId`, `trackingNumber`, `customerEmail`, `recipientName`, and `recipientPhone`. Repeated reads support retries; customer suspension does not suppress an existing booking lookup. `notification-svc` and `webhook-svc` have distinct keys/audiences/permissions. Webhook scope is only a verifier fixture until M02/M08 agree on a data/API contract; no webhook route or merchant config lookup exists. Peer review and real M08/M09 workers remain pending.

## 6. Data model and shared types

DD §4 is conceptual, with explicit persistence contracts rather than a finished migration. In Sprint 0, C1 reviews the baseline identity, parcel ownership, quotes, operation-key and messaging dependencies with B1/B2/C2 before the initial migration/seed. Agree shared interfaces so an identity-first implementation does not force other modules to redesign. Implement the reviewed baseline/Sprint 1 tables first; add phase-specific auth/extension tables through normal additive migrations before their endpoints ship. The target auth design needs:

| Entity / change | Required fields or invariant |
| --- | --- |
| `users` additions | `updated_at`; nullable `email_verified_at` only when verification/Google metadata is implemented; document `INVITED`, `ACTIVE`, `SUSPENDED` status values; nullable bcrypt `password_hash`, unique nullable `google_sub`, one role FK and unique canonical email remain |
| `auth_sessions` | User FK, family ID, created/last-refreshed timestamps, idle/absolute expiry, revoked timestamp/reason, bounded display metadata; no raw token |
| `refresh_tokens` | Unique token hash, family FK, parent/replaced-by link, expiry, consumed/revoked timestamps; one active successor per consumed token; indexed lookup |
| `access_grants` | Unique `jti`, human family/user or machine client FK, expiry, assurance/reauthentication metadata, revocation; enforce exactly one principal kind |
| `auth_action_tokens` (recovery/verification/invitation extensions) | Unique hash, purpose enum, user FK, generation, expiry, consumed/revoked timestamps; atomic use |
| `oauth_transactions` (Sprint 3 Google) | State hash, nonce, protected PKCE verifier, browser binding, login/link intent, initiating user where applicable, expiry, consumed timestamp; short-lived |
| `auth_audit_events` | Timestamp, event type, actor/target IDs, outcome and correlation ID; safe bounded metadata only; retention and restricted access |
| Existing `merchants` | Unique owner association; approval state and approver; approval changes audited |
| Existing `api_clients` | Unique public client ID, merchant FK, hash, explicit allowed scopes, revoked timestamp; add label/credential version if used by the contract |
| MFA extension | Encrypted TOTP factor/key version, activation/last-used time step; hashed recovery codes; short-lived challenge/reauthentication records |
| Durable security mail extension | Opaque job reference, encrypted short-lived delivery material, expiry/state; raw action tokens never in ordinary events/logs |

Use UTC server timestamps, FKs, unique constraints and atomic conditional updates/transactions; application checks alone do not protect races. Unique-email/sub conflicts must be handled safely under concurrent signup/callbacks. Test refresh-versus-suspension, invitation-versus-revoke, client rotation-versus-token issuance and two simultaneous token consumptions. Keep auth audit independent of mutable display profiles; avoid cascading away the security trail. Bound cleanup frequency and batch size rather than scanning on every request.

Define Zod DTOs and exported inferred TypeScript types in `packages/contracts` before endpoints/UI: role/status enums, customer/merchant registration, login, restricted/authenticated/challenge results, token pair response (refresh never exposed), public user/session DTOs, verification/reset/invite inputs, credential scopes and client DTOs. Sensitive fields never appear in public user serializers. Strict DTOs reject mass-assignment fields. Include RFC 7807 validation field errors and OAuth-specific token errors explicitly in OpenAPI. Generate and commit the typed client as required by plan §7.6.

## 7. Proposed endpoint inventory

Existing endpoint paths are preserved. New paths below are proposals to agree through the contract protocol. All `/api/v1` JSON errors follow RFC 7807; authenticated routes enforce current status, principal type and applicable role/scope/ownership; MFA applies when its extension policy is enabled. Optional email verification does not gate baseline booking/onboarding. CSRF controls apply to browser auth mutations.

| Endpoint | Boundary / result |
| --- | --- |
| `GET /api/v1/auth/csrf` | Establish anonymous/session CSRF context; no-store |
| `POST /api/v1/auth/register` | Customer only; generic accepted, then normal login; optional mail does not gate baseline booking |
| `POST /api/v1/auth/login` | Generic invalid response; full/restricted/challenge result after credential proof |
| `POST /api/v1/auth/refresh` | Cookie + CSRF; rotate once; new access JWT |
| `POST /api/v1/auth/logout` | Revoke current family; idempotent clear-cookie even on missing session |
| `POST /api/v1/auth/logout-all` | Authenticated; revoke all user families/grants |
| `GET /api/v1/auth/me` | Current public user, verification and merchant-onboarding state; accessible to restricted human sessions |
| `POST /api/v1/auth/complete-profile` | Restricted Google customer supplies missing name/phone only; no email/role/status edits |
| `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification` | Optional extension: purpose token / generic resend; no baseline business-access gate |
| `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` | Generic recovery request / consume token, revoke sessions |
| `POST /api/v1/auth/change-password` | Fresh current credential + policy; replace current session, revoke others |
| `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/{id}` | Own paginated list / own revocation; foreign ID 404 |
| `POST /api/v1/merchant/register` | Public merchant signup; server assigns role, creates pending profile atomically |
| `GET /api/v1/merchant/profile` | Own profile/status, including pending/rejected onboarding |
| `GET /api/v1/admin/users` | Implemented locally: Admin-only, bounded ID cursor pagination and role/status filters; safe staff summaries only |
| `POST /api/v1/admin/users` | Implemented locally: Admin creates courier/dispatcher; invitation rather than supplied temporary password; email collision is a conflict |
| `POST /api/v1/admin/users/{id}/invitation` | Implemented locally: Admin resends after cooldown or revokes an invitation; never returns a raw token |
| `POST /api/v1/auth/accept-invite` | Implemented locally: explicit POST sets private password and activates dispatcher atomically; courier remains setup-pending until M06 readiness exists |
| `PATCH /api/v1/admin/users/{id}/status` | Implemented locally: Admin suspend/reactivate; protected admin safeguards; transactional revocation |
| `PATCH /api/v1/admin/merchants/{id}` | Preserve approval endpoint; admin only; validated transition |
| `GET /api/v1/auth/google`, `GET /api/v1/auth/google/callback` | Preserve backend code + PKCE flow; safe redirects |
| `POST /api/v1/auth/google/link` | Fresh authenticated customer starts explicit linking; callback shared with bound intent |
| `POST /api/v1/auth/set-password/request`, `POST /api/v1/auth/set-password` | Google-only customer; fresh Google proof requests purpose-bound mailbox confirmation, then consumes token with new password; replace current session and revoke others |
| `GET/POST /api/v1/merchant/api-clients` | Own approved merchant client list/create; secret only in create response |
| `POST /api/v1/merchant/api-clients/{id}/rotate`, `DELETE /api/v1/merchant/api-clients/{id}` | Own approved merchant + recent proof; immediate replacement/revocation |
| `POST /oauth/token` | Confidential machine client only; standard OAuth request/response/errors |
| `POST /api/v1/auth/reauthenticate` | Current primary proof and MFA as required; Google accounts start a server-bound reauthentication transaction using the shared callback; short-lived server-recorded assurance |
| `POST /api/v1/auth/mfa/challenge/verify`, `POST /api/v1/auth/mfa/challenge/recover` | Limited challenge only; one-use TOTP step/recovery code |
| `POST /api/v1/auth/mfa/enrol`, `POST /api/v1/auth/mfa/confirm`, `POST /api/v1/auth/mfa/recovery-codes` | Enrol, activate or regenerate with recent proof |
| `DELETE /api/v1/auth/mfa` | Fresh proof; disallowed while role policy requires factor |

All listed paths are full paths; grouped GET/POST methods apply to the same full path. Paths explicitly marked “implemented locally” describe the unreviewed M01 branch only; the remaining recovery, verification, session-management UI and MFA paths are proposals/extensions, not existing APIs. Internal service lookups use private event/job-bound contracts in DD §5.3 and do not share a human/machine audience. Google GET redirect endpoints are narrowly handled protocol exceptions; ordinary GETs never consume action tokens or perform business mutations.

## 8. Modules, dependencies and configuration

Follow the layout in plan §6:

- `apps/core-api/src/modules/auth`: routes/controllers, authentication services, repositories, JWT/cookie/OIDC/password integration and action-token lifecycle.
- `.../modules/users`: admin provisioning, invitation lifecycle, suspension and user administration.
- `.../modules/merchants`: business approval, confidential clients and machine token policy; call shared auth signing/verification interfaces rather than duplicate implementations.
- `.../shared`: error handler, correlation IDs, redacted pino logger, rate limiter integration and agreed authentication middleware interfaces. B1 owns identity behaviour and coordinates shared-file edits with A2.
- `apps/web/src/features/auth`: forms, session bootstrap, route guards and security settings. Admin and merchant owners consume shared auth/session code, rather than create new stores.
- `packages/contracts`, `packages/db`, `packages/config`: shared types/schema/tooling through their owners; no direct imports of another module's internals.

The initial dependencies and lockfile are now installed for the customer-auth slice. Node.js 24.22.1 is pinned for onboarding/CI; local checks used the available 24.11.1 runtime. Dependency review and remaining development-only advisories are recorded in [security/dependencies.md](security/dependencies.md). Revalidate support/security notices before release. Use Node `crypto` for randomness/hashes, a maintained JOSE/OIDC implementation for protocol work, bcrypt for the mandated password algorithm and a small maintained TOTP library for the extension. Reuse the planned SMTP, Redis, Zod and Express middleware integrations. Do not write cryptographic primitives or a general-purpose identity framework.

`.env.example` must contain placeholders only: `DATABASE_URL`, `REDIS_URL`, configured `APP_ORIGIN`/`API_ISSUER`, distinct human, merchant-client and worker-service issuers/audiences, key file paths/current key ID, cookie/CSRF signing key references, optional Google client/secret/callback settings, SMTP settings, action-token/session TTLs and MFA/mail encryption key references. Validate at startup. Keep server secrets out of every `VITE_*` value and mounted frontend asset. Production refuses missing/weak keys, insecure cookies, demo seeds, auth bypasses or unconfigured required email delivery. Verify third-party dependency versions against the chosen runtime before claiming the stack is reproducible.

Scaffold a local `pnpm auth:keys:generate` command that writes ignored development key files and refuses to overwrite existing keys without an explicit action. Production keys are provisioned by operators through the existing secret mechanism, independently of the web build. Include signing/encryption key rotation and disaster-recovery instructions; encrypted factors/mail cannot be recovered if their only key is lost.

The dev-only mock session remains confined to `dev:mock`; do not allow request headers, query parameters or frontend flags to turn off backend authentication. Dev seed accounts use all five roles and are forbidden in production. First-admin creation is a separate local operator command with hidden password input or a one-use invitation, never a password passed in CLI arguments, printed to logs or committed.

## 9. Implementation phases and ownership

These phases refine the existing sprint sequence. Complete each as small contract-first PRs (target size from plan §7.2), not one authentication mega-PR. Update `handover.md` after each completed implementation iteration with changes, checks, manual steps, open issues and next work. Use existing review pairs and the two-reviewer protocol for shared schema/contracts. Owners are team roles, not delegated agents.

| Phase / original sprint | Owner and deliverables | Exit criteria |
| --- | --- | --- |
| A. Foundation and contracts / Sprint 0 | A1 workspace, Compose, CI and environment; A2 API/kernel/web scaffolds; C1 reviewed baseline/Sprint 1 migration and later phase schema contracts; B1 `docs/auth.md`, auth contracts, middleware interfaces; D1 session/form base; E2 MSW handlers | Fresh local setup works; reviewed initial migration/seed and explicit later migrations; generated OpenAPI/client; no auth bypass in production; deterministic tests available |
| B. Customer auth / Sprint 1 | B1 email/password, refresh/reuse/logout, live role/status guards and cookie/CSRF safety; D1 register/login/session bootstrap; A2 platform support | Active customer registers, logs in and books without mailbox verification, reloads safely and logs out; reuse revokes family; ordinary Sprint 1 booking/tracking integrates with no security-mail dependency |
| C. Sized security extensions / Sprint 1–2 | B1 optional verification/action-token lifecycle, recovery/change password and session management; D1 corresponding screens; A2 Mailpit and later durable mail integration. Size additive issues separately from baseline. | Verification is nonblocking; recovery races/replay rejected and grants revoked; no suspension/MFA bypass or enumeration; unfinished extension cannot block baseline booking |
| D. Staff and merchant onboarding / Sprint 2 | M01 staff suspension remains future work; local Sprint 1 invitation provisioning is in `handover.md`; M02 merchant register/approval/client CRUD; owned admin/onboarding forms | No public staff privilege creation; dispatcher invitation flow integrated and reviewed; courier activation waits for M06 readiness; suspension effective across replicas; pending merchant cannot create keys |
| E. External authentication / Sprint 3 | B1 Google PKCE/linking and full FR-A6 rate limiting; B2 `/oauth/token` and machine boundaries; D1/E2 corresponding screens | Google forgery/collision/replay rejected; machine scope/ownership/revocation matrix passes; plan Sprint 3 order/webhook integration consumes these contracts |
| F. Enterprise security extension / Sprint 4 | B1 sized MFA/reauth/audit extensions; A1/A2 sized durable security mail, credential rotation, secrets and failure exercises; D1/D2/E2 factor/recovery UX | Privileged MFA policy enforced server-side; recovery runbook exercised; production decisions resolved or release remains demo-only |
| G. Auth hardening / Sprint 4 | B/C authorisation suite; D/E accessibility; A1 runtime/dependency/CI checks; A2 operational failure tests | Required checks, coverage, manual test record and production checklist complete; outstanding issues explicitly recorded |

Implement basic throttling, redaction, input validation and cookie/CSRF safety alongside the first real endpoint. Sprint 4 is for completing and proving controls, not postponing basic security. A2 service-identity contracts are agreed in Sprint 0, delivered before event-bound worker lookups in Sprint 2 and extended to webhook configuration in Sprint 3. C2/E1 agree offline original-user/version/proof replay before the Sprint 4 FR-K3 UI; D2/E2 render replay only for Admin. Recovery/verification/invitation/MFA extensions need separate estimates and may be staged by explicit issue decision. Do not claim one person can complete all phases within a single sprint; size each issue with the ten-person owners and actual deadline.

First implementation PR: workspace/toolchain/configuration, minimal API/web entry points, Compose dependencies, health/readiness, redacted errors/logging, test scripts, contract generation and reviewed conceptual-schema coordination. Do not start by drawing login forms against invented endpoints or shipping password storage before the contract and migration are ready.

## 10. Automated acceptance matrix

Use Jest/Supertest/Testcontainers for backend and real PostgreSQL/Redis, Vitest/RTL for frontend forms/session logic, and axe against rendered components. No Selenium, Playwright or browser automation. Contract/schema checks and deterministic clock/provider fakes cover protocols without depending on Google in CI; real Google remains a manual check. Tests must exercise denial cases and database state, not only mirror implementation functions.

| Area | Required evidence |
| --- | --- |
| Registration | Correct bcrypt cost; no plaintext storage/logging; duplicate/concurrent canonical email; mass assignment; UTF-8 72-byte boundary; malformed/oversized body; customer-only role |
| Verification / action tokens | Baseline active customer can book without verification; optional extension verifies metadata without gating booking/onboarding; purpose mismatch; invalid/expired/consumed token; two consumers produce one success; resend invalidates earlier link; GET/scanner does not consume |
| Login / throttling | All roles; unknown/passwordless/suspended accounts; generic failures; per-IP/account distribution; spoofed forwarded headers; Redis failure; retry/backoff behaviour |
| JWT | Wrong algorithm/key/issuer/audience, expired/missing claims, malformed role, human/machine confusion, revoked jti, stale role and signing-key overlap |
| Refresh | Rotation once; reuse family revocation persists after error; parallel identical refresh; expired idle/absolute limits; suspension/rotation race; lost response; multi-tab coordination logic |
| Session lifecycle | Logout/all-session revoke invalidates existing access grants; reactivation cannot revive sessions; private query cache cleared; refresh does not loop; safe mutation retry only |
| Recovery / invites | Enumeration responses; SMTP failure and resend; old-password invalidation; sessions revoked; MFA retained; admin-only provisioning; revoked invite and wrong target; last-admin/self safeguards |
| Google | State/nonce/PKCE mismatch, callback replay, code reuse, invalid ID token, duplicate `sub`, same email collision, cancelled consent, missing phone, explicit linking proof |
| Merchant machine access | All approval states; owner suspension; invalid/revoked secret; rotation invalidates old tokens; scope subset/unknown scope; cross-merchant reads; machine cannot call human endpoints |
| MFA extension | Enrolment confirmation; wrong/expired/replayed code; one-use recovery race; attempts; primary-only session cannot access business/privileged routes; reset does not remove factor |
| Access control | Every corrected DD Table 3 capability × five human roles + anonymous + machine + service; Admin inherits dispatch; Dispatcher replay denied; owner/foreign objects; lists/counts/media/socket joins; protected response never leaks private fields |
| Frontend / accessibility | Field errors; keyboard/focus; password paste/autofill; duplicate submit; loading/restricted/expired session; offline; disabled provider; narrow layout; axe checks |
| Internal service identity | Wrong signature/issuer/audience/kind/scope/principal, expired/revoked key or principal, key overlap deadlines, event/parcel mismatch, malformed ID, six-field response, repeat reads, current contacts, suspended-customer booking, cross-port isolation and DB outage; real M08/M09 delivery remains separate |
| Operations | Two API replicas share revocation/limits; DB/Redis/SMTP outage; no token leakage from API/proxy logs; ignored secrets; production rejects dev config; migration and clean startup |

Root scripts now available for the implemented slice: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm contracts:check`. `pnpm test` runs backend/frontend unit suites; integration requires Docker. Enforce plan NFR-14's ≥80% service/domain line coverage and review uncovered security branches. CI must also run secret scanning, contract/client drift checks and dependency vulnerability review with recorded exceptions. Do not invent a “passed” status before these scripts exist and have run.

## 11. Manual verification plan

### Historical planning-only review

The original planning review used `git diff --check` and compared `docs/auth.md`, `plan.md` and `SWIFTDROP_DESIGN_DOCUMENTATION.md`. Runtime setup/start commands and the current slice-specific manual plan now exist in [README.md](../README.md).

1. Compare §2 against DD Table 2 and plan FR-A/FR-M. Expect five account roles, public tracking, Google customer login and a distinct merchant machine flow.
2. Compare §9 against plan Sprints 0–4 and ownership. Expect the same order, reviewed initial migration plus planned additive phase migrations, and ten-person parallel workstreams.
3. Review §12's decisions and extension labels. Expect Node.js 24 alignment, bcrypt limitations and separately sized verification/MFA/recovery/invitation scope to be explicit, with no claim that they are implemented.

### Runtime plan to execute after the matching phases land

The following onboarding commands now exist for the customer-auth slice; skip key generation if keys already exist. Later-feature steps below remain future checks. The current startup and slice-specific manual test plan are in [README.md](../README.md); Redis uses localhost:6380. Record later command/port changes in the implementing PR and handover. `db:reset` is destructive and is for the disposable local development database only.

```sh
cp -n .env.example .env
pnpm install --frozen-lockfile
pnpm auth:keys:generate
pnpm db:generate
docker compose up -d
pnpm db:reset
pnpm dev
```

The implemented local example uses web `http://localhost:5173` and an API proxied through Vite. Mailpit `http://localhost:8025` is reserved for the later mail extension; use `/api/docs` via the proxy to inspect full endpoint paths. Obtain dev passwords from README, never assume production credentials. Set the real Google development client/callback privately only for Phase E. Production must use HTTPS/Secure cookies; local HTTP alone cannot verify that deployment boundary.

1. Open `/auth/register`. Register and log in, then book before verifying a mailbox. Expect normal baseline access, the correct role home and no raw credential in URL/storage. If the optional verification extension is implemented, inspect Mailpit and confirm explicitly; expired/used links and resend update verification metadata safely without blocking baseline booking or creating duplicate accounts.
2. Open `/auth/login` in two tabs. Reload both and exercise concurrent API activity. Expect one coordinated refresh at a time, persistent session and no redirect loop. Sign out in one tab; expect the other to lose protected access and clear private data. Backend automated tests cover forced identical-token reuse.
3. Open forgot/reset password. Compare known/unknown address messages. Use a reset link twice, then try the old password and an existing session. Expect generic request acceptance, one successful reset, old password/session rejected and no MFA bypass.
4. As admin open `/admin/users`. Invite courier/dispatcher, inspect Mailpit, accept with a private password and attempt role-field tampering through `/api/docs`. Expect server rejection of privilege escalation. Suspend that logged-in user in a second session; expect subsequent protected calls to fail, including after reload/reactivation until new login.
5. Open `/merchant/register`, then `/merchant/onboarding`. Expect pending approval and disabled credential/order access; mailbox verification is not an additional baseline gate. Approve as admin, create a scoped client and copy the once-only secret; revisit the page and expect no secret retrieval. Rotate/revoke and expect old token/secret rejection immediately.
6. From a private terminal/HTTP client, call `/oauth/token` using form encoding and Basic credentials, then the own-order API with a valid scope. Avoid pasting secrets into shell history or logs. Expect a 900-second bearer token and no refresh cookie. Test read-only scope against a write, a foreign merchant object, rejected merchant and machine token against admin routes; expect denial without leaked records.
7. Once configured, use Continue with Google. Test consent cancellation, reload and login with an existing password-account email. Expect safe retry or explicit existing-account sign-in/linking, with no automatic merge. A first Google customer with missing phone must complete the required profile before booking.
8. With MFA implemented, enrol as admin/dispatcher and merchant owner, save recovery codes privately, then log out/in. Expect primary credentials alone to give no privileged session, a code to complete login, one-use recovery, and fresh proof for key/factor changes. Reset the password and expect MFA to remain required.
9. Open public `/track/:trackingNo` signed out. Expect status/time/town only. As customer/courier, request foreign resources; expect 404. Verify Dispatcher cannot administer users, approve merchants or replay failed webhooks. Admin must retain dispatcher create/status/assign/cancel capabilities and Admin-only replay. Inspect a public tracking socket and an authorised private subscription: expect separate room names/projections; reassignment removes old courier access.
10. Repeat relevant forms at 360 px and desktop, 200% zoom, keyboard-only and reduced motion. Test slow/offline, double-submit, SMTP/Redis/DB unavailable and Google unavailable. Expect readable feedback, no duplicate action, no false success, bounded retries and no exposed credentials. For courier offline replay, require the original user's fresh session, stable operation key and expectedVersion; stale/reassigned/proof-upload failures require review. Validate private proof URLs and name-required/photo-optional policy. Exercise worker configuration lookups with valid/expired/wrong-audience service identity; expect event-bound minimum data or denial.

Record actual results, browser/device, failed cases and unresolved issues in the implementation handover. These are user-run checks; no manual verification has been performed for this planning iteration.

## 12. Decisions, production gates and deferred scope

| Item | Finding / proposed resolution | Effect |
| --- | --- | --- |
| Runtime support | Corrected baseline uses Node.js 24 LTS consistently in DD, delivery plan and report. Pin a compatible security patch, libraries and images before scaffolding; Node.js 20 is no longer the target. [Node.js release status](https://nodejs.org/en/about/previous-releases) | Runtime-line decision resolved; concrete dependency/image compatibility remains implementation work |
| bcrypt constraint | Cost 12 retained. Enforce 72 UTF-8 bytes and document reduced passphrase support; a modern algorithm change needs an ADR | Known baseline trade-off, not hidden conformance |
| MFA/recovery scope | Not original FRs. Add issues, contracts and schema review; agree the proposed privileged-role policy and lost-factor identity verification procedure | Baseline demos may precede it; proposed enterprise production gate requires it |
| Email delivery | Mailpit only proves local handling; production needs a configured SMTP sender, verified delivery setup, bounded durable retries and operational ownership | Production recovery/verification must be exercised with the actual sender |
| Secrets and deployment | Domain/origin, TLS/proxy topology, Google project/consent/callback URLs, signing/encryption key custody and rotation are not present | Configure and test before exposure; no secrets committed |
| Google sensitive-action proof | Verify enabled `auth_time` claim support and freshness behaviour with the actual client. Stale/missing proof requires an enrolled alternative factor or refusal; consent alone is insufficient | Gate Google-only password setup/other sensitive actions without weakening normal Google login |
| Schema / contracts | DD §4 is conceptual and now specifies refresh families, quotes, idempotency and consumer state; auth/action/MFA details are phase contracts | Review baseline initial migration with C1/B1/B2/C2; implement extension tables before their features; do not claim a complete existing schema |
| Verification policy | Corrected baseline has no mandatory mailbox verification for booking/onboarding; provider claim validation and invitation/recovery mailbox proof are distinct | Optional metadata/resend flow is a sized extension; a future business-access gate needs explicit product/contract changes |
| Worker credentials | Event-bound lookup requires a distinct service principal, audience and narrow scope under DD §5.3 | A2/B1 coordinate provision/rotation and verifier; user/client token confusion is tested before workers ship |
| Operator safeguards | Define first-admin provisioning, key-loss recovery, last-admin recovery and audit/PII retention periods | Document and exercise before production; no shared default admin password |
| Acceptance evidence | Customer auth endpoints/UI, migration, generated contracts and CI definition now exist. Local checks: 11 backend unit, 22 PostgreSQL/Redis integration and 8 frontend tests; service/domain line coverage 94.3%; lint/typecheck/build/contract/format checks pass. | Browser manual checks, hosted CI/gitleaks, the full sprint and production gates remain unverified/incomplete |

Production exit checklist:

- Baseline auth FRs implemented, Should items delivered or explicitly deferred per the original plan; no hidden auth bypass or dev seed.
- Supported runtime/dependencies agreed and pinned, TLS/cookie/CSRF/CORS verified behind the actual proxy.
- Five-role/ownership/machine-scope matrix, refresh concurrency/reuse, reset/invitation races and suspension/revocation tests pass.
- Proposed privileged MFA/reauthentication policy and recovery procedure implemented and exercised before making the enterprise claim.
- If enabled, verification/recovery/invitation mail and failure recovery exercised with the actual sender; credential/key rotation exercised; backup/restore covers the database and separately protected encryption keys.
- CI checks and required coverage pass; frontend accessibility and responsive manual results recorded; residual issues have owners and release decisions.
- Audit records and logs exclude secrets, security alerts identify reuse/credential changes without unbounded polling, retention is bounded and an incident runbook covers stolen tokens/keys.

Deferred: additional identity providers, passkeys/WebAuthn, SAML/enterprise federation, multi-user merchant organisations, role conversion, self-service email change, Google unlinking, impersonation and advanced adaptive fraud controls. Email remains immutable through initial settings APIs; do not ship an unverified edit field. These exclusions do not remove any baseline authentication requirement.

## 13. Reference use

Security recommendations above combine the existing SwiftDrop requirements with explicitly proposed local policies. OWASP and IETF references support the controls; they do not prescribe this project's chosen session lifetimes, rate thresholds, team ownership or sprint dates. Revalidate runtime support and library security at implementation/release time. No compliance certification or penetration-test result is implied.
