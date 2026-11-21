# SwiftDrop: Demo Script

Target length: about 12 minutes. Presenters follow the slice owners in [CONTRIBUTIONS.md](../CONTRIBUTIONS.md).
Everything runs locally; nothing here needs a real provider except the optional Google step.

## Before the demo (do once, 15 minutes early)

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
pnpm dev        # starts core-api, web, outbox-relay, webhook-svc, notification-svc, ai-assistant
```

Checks before going on stage:

- `http://localhost:5173/api/ready` shows `outboxRelay: ready`. If it says degraded, the relay is down and no event will flow.
- Mailpit is open at `http://localhost:8025`. RabbitMQ UI at `http://localhost:15672` (guest/guest) is optional.
- Browser profiles: one signed-in dispatcher, one signed-in courier on a phone-sized window, one private window for the customer.
- Register a merchant at `/auth/merchant-register` with a unique email, but leave it pending so the approval step can be shown live. The seed script does not create an approved merchant profile (the README says merchant profiles are not seeded); this has not been confirmed against a fresh database.
- Demo accounts (development-only password `Local demo passphrase 2026!`): `customer@`, `courier@`, `dispatcher@`, `admin@swiftdrop.test` (and `merchant@swiftdrop.test`, which has no approved merchant profile).
- Confirm the seeded courier is on duty (`/dispatcher` lists them). The seed creates an on-duty profile.
- **Google sign-in** needs private credentials in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=http://localhost:5173/api/v1/auth/google/callback`). If they are not set, the button is unavailable; say so and show the password login. Do not paste credentials on screen.
- **Merchant webhook receiver.** Core-api rejects `http://localhost` URLs (SSRF rule), so pick one:
  - *Public HTTPS receiver (preferred, shows the real merchant setup):* open a free request-capture page, copy its HTTPS URL and save it on `/merchant/webhook`.
  - *Local fallback (documented in [messaging.md](messaging.md)):* create `.local/webhooks/targets.json` as `{"<merchant-uuid>":{"url":"http://localhost:4010/hook","secret":"local-dev-secret-0123456789"}}`, set `WEBHOOK_DEV_CONFIG_FILE` and `WEBHOOK_DEV_ALLOWED_HOSTS=localhost` in `.env`, restart `pnpm dev`, and run a receiver that prints headers and body: `node -e "require('http').createServer((q,r)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{console.log(q.headers,b);r.end('ok')})}).listen(4010)"`. Look up the merchant UUID in the database.

## Run of show

### 1. Customer login, including Google (about 2 min) - presenter: doktur-umair (M01)

1. Open `http://localhost:5173/auth/login`. Say: passwords are bcrypt cost 12, access token is RS256 for 15 minutes, refresh token rotates and is an HttpOnly cookie.
2. Click **Continue with Google** (if configured). Point out the backend runs the authorization-code flow with PKCE; the browser only ever gets SwiftDrop's session, never Google's tokens.
3. Sign in as `customer@swiftdrop.test` with the password to continue if Google is unavailable.
4. Optional, 20 seconds: `/settings/security` shows sessions and two-step verification.

### 2. Quote and booking (about 2 min) - presenters: umar (M03) for the quote, Nihaaj (M04) for booking

1. umar: open `/parcels/new`. Enter Colombo to Kandy, 2 kg, small parcel. Expect **LKR 570.00** (57000 cents = base 45000 + 1 extra kg x 12000). Say: pricing is a Strategy per zone and size, money is integer cents, the quote is locked for 15 minutes.
2. Nihaaj: confirm the booking. Say: it is a second request with an `Idempotency-Key`, so a double click returns the same parcel. Note the tracking number, for example `SD-7KQ2M9XA-Y`, and say it is random with a check character, never sequential.
3. Open `/parcels` to show the history and the parcel detail with its timeline.
4. Keep this parcel for the rest of the demo.

### 3. Real-time tracking (about 1.5 min) - presenters: shazan (M05) for the tracking page, akeel (M09) for realtime

1. shazan: open `http://localhost:5173/track/<trackingNo>` in a second window, signed out. Show it carries status, time and town only, with no names, phones or addresses.
2. akeel: leave that window visible. When the dispatcher and courier act in sections 5 and 6, the status badge changes without a refresh. Say: each tracking number is its own Socket.IO room, replicas share rooms through Redis, and a customer can only join rooms for their own parcels.

### 4. Merchant API order and webhook (about 2.5 min) - presenters: Abdhullah (M02) for the order, Roshan (M08) for the webhook

1. Abdhullah: show that an unapproved merchant cannot create API credentials, then, as admin, approve it on `/admin/merchants` (the merchant was registered at `/auth/merchant-register` beforehand; see the checklist). As the merchant open `/merchant/clients` and create an API client. Copy the client id and secret once; they are shown once.
2. Request a token (client credentials, HTTP Basic, form body), directly against the API port:

   ```sh
   curl -s -u "<clientId>:<clientSecret>" -d "grant_type=client_credentials&scope=orders:write" http://localhost:3000/oauth/token
   ```

3. Create an order with that bearer token:

   ```sh
   curl -s -X POST http://localhost:3000/api/v1/merchant/orders \
     -H "Authorization: Bearer <accessToken>" -H "Idempotency-Key: demo-001" -H "Content-Type: application/json" \
     -d '{"originDistrict":"Colombo","destinationDistrict":"Kandy","weightGrams":2000,"lengthMm":300,"widthMm":200,"heightMm":100,"recipientName":"Demo Recipient","recipientPhone":"0771234567","recipientAddress":"12 Temple Road, Kandy"}'
   ```

   Expect 201 with a tracking number. Repeat the same call: the same order comes back (idempotent).
4. Show the failure that matters: request a token without `orders:write` (or omit the scope) and call the same endpoint; expect 403. Say the order of checks is scope, then approved merchant, then body.
5. Roshan: show the receiver. Expect a POST with `X-SwiftDrop-Signature` and a timestamp; the body carries `eventId`, `type`, `version`, `sequence` and no phone or address. Say: the request handler wrote the outbox row in the same transaction, the relay published it, and the webhook service signed it with HMAC-SHA256.
6. Roshan, optional 30 seconds: `/admin/webhooks` (as admin) shows the delivery log and attempts; a failing endpoint retries with TTL backoff and ends in the DLQ with a **Replay** button.

### 5. Dispatcher assigns (about 1.5 min) - presenter: Noora (M06)

1. As `dispatcher@swiftdrop.test` open `/dispatcher`. Find the customer parcel in the unassigned queue.
2. Assign it to the on-duty courier. Show the workload counter go up. The tracking window from section 3 should react.
3. Say: assignment is `UPDATE ... WHERE courier_id IS NULL AND version = ?`. If two dispatchers race, exactly one wins and the other sees a conflict and a refreshed queue; it never retries silently. Open a second dispatcher window and assign the same parcel to show the conflict if time allows.

### 6. Courier updates status (about 1.5 min) - presenter: muzny100 (M07)

1. In the phone-sized window sign in as `courier@swiftdrop.test` and open `/courier`. Only assigned parcels are listed.
2. Move the parcel through Picked up, In transit, Out for delivery, then **Delivered** with the recipient's name (a photo is optional). Show that a skipped step is refused with 409 `invalid-transition`.
3. Optional: switch the browser to offline, make an update, go back online and show the queued update replay in order. Mention the app is installable (PWA).
4. Say: the courier call returns immediately; parcel, history and outbox rows are written in one transaction and everything else is asynchronous.

### 7. Notification in Mailpit (about 1 min) - presenter: akeel (M09)

1. Open `http://localhost:8025`. Show the booking confirmation and the status emails, one per event, not duplicates.
2. Say: the worker records each `eventId`, skips repeats, and stores recipients masked (for example `077***4521`). Events carry no contact data; the worker fetches it from the API with a service token.
3. Return to the tracking window: it shows Delivered, so the realtime path, the webhook receiver and Mailpit all reflect the same status update.

### 8. Wrap-up (about 1 min) - presenter: chamoth (M10)

- Show `pnpm test` and the test report in [test-reports/TEST_REPORT.md](test-reports/TEST_REPORT.md), including the authorisation, event-flow and pricing contract groups.
- Mention the shared kernel: RFC 7807 errors with correlation ID, redacted logger, cursor pagination, OpenAPI at `/api/docs`.

### Bonus items (only if time allows)

- AI assistant (read-only MCP tools, calls the REST API with the user's JWT): umar (M03) presents.
- Kubernetes: `deploy/` Helm chart. No owner is recorded for this slice in the contribution sheet; the team should name a presenter.

## If something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| No webhook, no email, no realtime update | Outbox relay is not running | Check `/api/ready`; start `pnpm --filter outbox-relay dev` |
| Webhook URL rejected on save | Loopback or private address (SSRF rule) | Use the public HTTPS receiver or the dev config fallback |
| Token request returns 401 | Wrong client secret or secret not copied | Create a new client; secrets are shown once |
| Assign returns conflict | Another dispatcher already took the parcel | Expected; the queue refreshes |
| Google button missing | Credentials not in `.env` | Show password login |
| Notification worker 401/404 | `pnpm services:provision` not run | Run both provision commands once |
