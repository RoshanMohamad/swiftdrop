# SwiftDrop: Member Task List (remaining work)

Rules for everyone:

- Work on **your own branch**, commit under **your own GitHub account**, push when you finish a task.
- One small task = one commit with a clear message (`feat(scope): ...`, `test(scope): ...`, `docs(scope): ...`).
- Open a PR from your branch into `integration/merge-all`. Your review-pair partner approves it.
- Follow `CLAUDE.md`: no cross-module repository imports, one transition table, money in integer cents, no PII in events.
- Each task is sized at about 30-90 minutes. Do the first two before anything else.

## M01: Identity (doktur-umair, `umair-dev`) | reviewer: M02
1. Tests: refresh-token rotation and family revocation on reuse (integration).
2. Tests: `requireRole` plus ownership returns 404 for a foreign customer parcel.
3. Check login/token rate limits are per IP and per account; add a test.
4. README: document the Google OIDC (PKCE) flow and the env vars it needs.

## M02: Merchant platform (Abdhullah, `feature/Merchant`) | reviewer: M01
1. Test: merchant token without `orders:write` gets 403 on `POST /merchant/orders`.
2. Test: unapproved merchant cannot create API credentials.
3. Test: repeated `Idempotency-Key` returns the original order.
4. Add a webhook URL SSRF test (private and loopback addresses rejected).

## M03: Pricing, zones, reports (umar, `umarali`) | reviewer: M04
1. Unit test fixture: Colombo to Kandy, 2 kg = 57000 cents.
2. Contract test suite run against every `PricingStrategy`.
3. Test: quote expires after 15 minutes and must be recalculated.
4. Test: daily report CSV export.

## M04: Customer booking (Nihaaj, `feature/m04-customer-booking`) | reviewer: M03
1. Test: customer cannot read another customer's parcel (expect 404).
2. Test: `POST /parcels` is idempotent on `Idempotency-Key`.
3. Check receipt generation on DELIVERED against a live MinIO (known open issue) and note the result.
4. Booking wizard: show a clear message when the quote has expired.

## M05: Lifecycle and tracking (shazan, `shazan-dev`) | reviewer: M06
1. Unit tests for every allowed and every disallowed transition (409 `invalid-transition`).
2. Test: `DELIVERED` requires recipient name or photo; `FAILED` requires a reason.
3. Test: `parcel_status_history` rows are never updated or deleted.
4. Test: the public tracking payload contains no PII (status, time and town only).
5. Ask the team to confirm the enum value for "return to sender" (see CLAUDE.md). Do not add it before then.

## M06: Dispatch (Noora, `feature/m06-dispatch`) | reviewer: M05
1. Concurrency test: two dispatchers assign the same parcel and exactly one wins; the other gets a conflict.
2. Test: courier capacity limit is enforced on assign.
3. Dispatcher console: refresh the queue after a conflict (no silent retry).
4. Test: reassign writes a history row and an outbox row in one transaction.

## M07: Courier PWA (muzny100, **create branch `feature/m07-courier-pwa` from main**) | reviewer: M10 | status: started
1. Create the branch and push it with a one-line change to `docs/MEMBER_TASKS.md` marking it started.
2. Test: courier sees only assigned parcels.
3. Test: courier updating an unassigned parcel gets 403 and the attempt is logged.
4. Offline queue: add a unit test for replaying queued updates in order.
5. Check the PWA manifest and install prompt on a phone and note what is missing.

## M08: Eventing and webhooks (Roshan, `feature/eventing-webhooks`) | reviewer: M09
1. Integration test: relay publishes to a real broker and sets `published_at`.
2. Test: a failing endpoint is retried with TTL backoff, then dead-lettered.
3. Test: the HMAC signature header and timestamp verify correctly.
4. Add relay health to `/api/ready` (known open issue), or open an issue if the team wants a different approach.

## M09: Notifications and realtime (akeel, `notifications-realtime`) | reviewer: M08
1. Test: a duplicate `eventId` is skipped (idempotent consumer).
2. Test: an out-of-order `sequence` is discarded.
3. Test: notification recipients are stored masked (`077***4521`).
4. Test: a customer cannot join the room of someone else's parcel.

## M10: Platform kernel and web (chamoth, `lavin-dev`) | reviewer: M07
1. Test: the error middleware returns RFC 7807 with `correlationId` and no stack trace.
2. Test: the logger redacts `password`, `phone`, `address` and `authorization`.
3. Test: cursor pagination returns stable pages.
4. Accessibility check on the role-guarded screens; fix or list the issues found.

## Before you push
- `pnpm test` passes locally for your area.
- No secrets in the diff (CI secret scanning fails the build).
- Your commit author is your own account (`git config user.name` and `user.email`).
