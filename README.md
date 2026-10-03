# Aperture

[Try the complete judge workflow](docs/JUDGE-GUIDE.md).

A private workspace for giving someone a short-lived permission to ask one approved question about an object. The recipient receives a timestamped finite answer. They never receive the owner's reference photo or private observation evidence.

**Every answer is approved by the owner.** The optional Ring source adapter calls the official device and snapshot APIs when connected with an authorized Playground token. Without a token, uploaded references and manual observation remain available. Automated recognition is not implemented. Official Playground live video played inside the private owner workspace on 28 September 2026. Archived snapshot retrieval returned `MEDIA_NOT_FOUND` for those events. Browser-saved live frames have no Ring capture timestamp and can release only **Cannot verify**. No sample data is inserted on startup.

[Watch the 109-second Ring demo](https://www.youtube.com/watch?v=WLnjM5z7IPQ). The video uses edited stills from the verified official Playground flow, with Deepgram Aura 2 Thalia narration and English captions. The demonstrated answer is **Cannot verify** because Ring capture time is unavailable. The final reviewed suite passes 38 tests. Read the [Ring integration friction log](docs/FRICTION-LOG.md) for observed errors and feature requests.

## Run locally

Requires Node 22.13 or newer and npm.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:4332`. Register a private account with a password of at least 12 characters. Data survives restarts in `data/aperture.sqlite`. For frontend development, use `npm run dev` instead of `npm start`.

Use the exact `PUBLIC_URL` origin in your browser. Requests from another origin are rejected.

## A complete workflow

1. Add an authorized reference photo, mark a bounded area by dragging or typing coordinates, and name one object and its location.
2. Create a pass after previewing its exact question. Set an expiry, a finite check budget, and a cooldown. Save the bearer link immediately; it is shown once and only a hash is stored.
3. Open the link in another browser session. The recipient requests a check. One budget unit is reserved atomically; retries using the same request key do not spend again.
4. The owner's Requested checks screen updates automatically. Make an actual current observation, choose a finite outcome, preserve the observation time, and optionally attach a private note or evidence photo. Confirm the disclosure.
5. The server rechecks the pass inside the completion transaction. Revoked or expired passes cannot release results. The recipient polls for only the finite result and time.
6. Revoke any pass or delete its reference. Deleting a reference removes its images, passes and observation records. The journal preserves a deletion event.

The current reference object and area are fixed when the pass is created. A recipient cannot supply a new question, change the scope, see a camera frame or fetch an owner's record.

## Permission and reliability guarantees

- 256-bit random bearer tokens; hashes at rest; no token logging. Anyone holding the link can use it. This is not named-recipient authentication.
- Expiry from 1 minute to 24 hours, 1–20 checks, 60–3,600 second cooldown. UI offers a smaller set of practical choices.
- SQLite immediate transactions serialize budget consumption, completion and revocation. Permission is checked again after any asynchronous image preparation and immediately before saving a result.
- Checks time out after 2 minutes. A request consumes budget even if the owner does not respond. Duplicate request keys are idempotent within a pass. The recipient saves only the pass-scoped request key and job ID in sessionStorage, so pending and completed checks recover after a reload without spending another request. No answer, question or imagery is restored from storage; the server must authorize a fresh result read. If browser storage is unavailable, the page explains that recovery cannot survive a reload.
- An observation older than 60 seconds becomes `cannot_verify`; its original time is retained. Client timestamps cannot establish truth: the owner is accountable for recording the actual time and observation. There is no automatic recognition or accuracy claim.
- `not_visible` means only the reference object was not visible in the approved area at the stated time. It establishes neither collection nor theft, ownership, condition or global absence.
- Revocation prevents subsequent API reads, including of a previously completed observation. It cannot erase an answer somebody has already read or copied. The recipient view revalidates active access about every 3 seconds while recovering or displaying a check, and every 10 seconds before a request. Known expiry clears the answer locally even when the network is unavailable.
- Uploaded reference and evidence photos accept JPEG, PNG and WebP up to 5 MB and 25 megapixels. Ring downloads accept JPEG or PNG up to 8 MB and 25 megapixels. Sharp normalizes orientation, strips metadata and stores a resized JPEG up to 1,600 pixels on each axis. Recipient payloads never include image data or evidence URLs.

## Accounts and server

Accounts are local to this deployment. Scrypt hashes passwords with independent random salts. Session tokens are random, hashed in SQLite, HttpOnly and SameSite=Strict, expiring after 7 days. HTTPS production cookies are Secure. Every owner query checks account ownership. Origin checks reject cross-site mutations. Request sizes and request/authentication rates are limited. CSP, no-referrer, no-store and frame restrictions are set by the server.

Email verification and password recovery are not configured. The UI states this before account creation. This release is suitable for a controlled private deployment with known users; add managed authentication, operational monitoring and abuse controls before unrestricted sign-up.

The journal displays and exports the latest 100 events with current reference/pass metadata; images and evidence notes are omitted. Database records have no automatic retention timer. Delete a reference to purge the associated imagery and passes. Use an encrypted host disk and protect backups. Do not put real camera imagery into test fixtures or repository commits.

## Deploy without AWS

Build and run on any single-instance Node host with a persistent disk and a reverse proxy providing TLS. Do not use an ephemeral serverless filesystem or multiple independent application instances against copied SQLite databases.

Required production configuration:

```sh
NODE_ENV=production
PUBLIC_URL=https://your-aperture-domain.example
HOST=0.0.0.0
PORT=4332
DATABASE_PATH=/data/aperture.sqlite
```

The process refuses production mode without an HTTPS `PUBLIC_URL`. It listens only on loopback by default for local development. Configure the proxy to preserve the request Origin, disable request-path logging for `/p/` and `/api/p/`, and apply HTTPS. Pass tokens are in bearer URLs; the application sends `Referrer-Policy: no-referrer` and loads no third-party resources. Keep proxy/access analytics from recording them.

A Dockerfile is included. Set the same environment variables and attach a writable persistent volume to `/app/data` (the container runs as uid 1000). Termination closes the server and database. Back up the database with SQLite's backup API or while the process is stopped; do not copy only the main file during WAL writes.

```sh
docker build -t aperture .
docker run --rm -p 4332:4332 -e NODE_ENV=production \
  -e PUBLIC_URL=https://your-aperture-domain.example \
  -v aperture-data:/app/data aperture
```

## Verify

```sh
npm test
npm run build
npm audit --omit=dev
```

The automated suite covers account isolation, consent and schema validation, token handling, idempotent budgets and cooldowns, stale/future observations, expiry and revocation during a pending observation, inaccessible cached results, scoped job lookup, media deletion, HTTP authentication/CSRF, image sanitation and response privacy.

`test/browser-check.mjs` is an opt-in browser workflow against a separately launched throwaway database. It creates synthetic verification fixtures and accounts, and is never part of app startup:

```sh
DATABASE_PATH=/tmp/aperture-review.sqlite npm start
# In a second terminal:
node test/browser-check.mjs
```

The isolated recovery regression starts its own in-memory server (no local account data is changed):

```sh
npm run build
node test/recipient-recovery.mjs
```

It covers pending/completed reloads with a one-check budget, no cached answer before authorization, transient polling failure, an accepted request whose response was lost, revocation, local expiry during a network interruption and unavailable browser storage.

## Automated recognition boundary

The Ring adapter retrieves authorized images for human review. Automated recognition remains unimplemented; it would require a constrained model and evaluation of ambiguity and occlusion before use. Permission checks surround asynchronous image retrieval and final approval. The snapshot path still needs a verified image from a real Ring device or the official simulator. The live-frame reference and conservative recipient-review workflow was exercised end to end with the official Playground on 29 September. The [public demonstration video](https://www.youtube.com/watch?v=WLnjM5z7IPQ) shows that conservative flow using edited browser stills.

## Interactive permission illustration

The public landing includes an original Three.js cutaway of the permission model. Select **Private reference**, **Permitted scope**, or **Finite answer** to explore what the owner retains and what a pass allows. The illustration uses procedural shapes, not uploaded photos or a reconstructed camera scene. The owner and recipient API boundaries are unchanged.

The scene loads on approach to the viewport, caps pixel density at 1.5, renders only during a selected transition or resize, and stops when hidden or offscreen. Reduced motion skips camera interpolation. An SVG diagram and the full keyboard-accessible explanation remain available without WebGL or after context loss. No external textures or analytics are loaded.

To verify the illustration in a disposable local environment:

```sh
PORT=4342 PUBLIC_URL=http://localhost:4342 DATABASE_PATH=/tmp/aperture-3d-review.sqlite npm run dev
# In another terminal:
BASE_URL=http://localhost:4342 REVIEW_ROUND=2 node test/privacy-cutaway.mjs
```

The browser check covers three-layer keyboard controls, idle/offscreen suspension, reduced motion, a high-DPR mobile viewport, WebGL context loss, unavailable WebGL and renderer removal when opening authentication. It writes screenshots and measured draw-call, triangle and frame timing data under `.impeccable/review/3d-*`. Measurements come from a local headless Chromium browser; they do not establish real-phone speed.

## Ring source adapter

Open **Ring source** in your private workspace to connect a short-lived Playground token. The adapter uses Ring’s official REST API; Ring currently documents no official Partner SDK. No AWS service or extra SDK dependency is needed.

The token is bound to your signed-in Aperture account and kept in server memory. Access is limited to at most 30 minutes; expired credentials and temporary frames are purged by a 10-second cleanup sweep. Disconnecting, signing out or restarting the server clears access. Tokens and pre-signed download URLs are never returned by the API, stored in SQLite or written to application logs. The input is cleared after connection attempts. Full production OAuth account linking and refresh are not included.

Device discovery supplies the permitted device and camera-module identifiers. Source selection cannot accept an arbitrary camera URL. Downloads use the official 303→GET flow; the Ring bearer is never forwarded to the pre-signed destination. Default download hosts are `api.amazonvision.com` and subdomains of `amazonvision.com`. If a real response uses another documented host, the operator may add only its exact verified hostname to the comma-separated `RING_MEDIA_HOSTS` environment setting. HTTPS is required and subsequent redirects are rejected. Do not guess a host or broadly allow arbitrary domains.

Reference requests begin at the current connection verification time (with a 24-hour maximum window). Each per-pass Ring check requests media only from the last 60 seconds and never before connection verification, preserves `X-Media-Timestamp` separately from download time and requires human approval. Missing, future, out-of-window, unknown-origin or stale evidence cannot produce a definite result. Image metadata is stripped and the full image is resized; the Ring watermark is not intentionally removed. The private journal preserves final source provenance; recipients receive only the finite outcome, source time and human-review provider label.

The API checks the pass after the asynchronous download and again during final release. Disconnection cancels in-flight connection/image retention and invalidates temporary image access. Temporary preview images expire after five minutes; images used in a reference or completed private observation remain until the reference is deleted. The existing manual workflow remains usable.

See [RING-DEMO.md](RING-DEMO.md) for the actual runtime path, public demonstration, primary documentation and unresolved archived-media verification. New automated provider tests use synthetic contract responses and are explicitly not official Ring simulator evidence:

```sh
node --test test/ring.test.mjs
node test/ring-browser.mjs
node test/recipient-recovery.mjs
```

On September 12, 2026, the 22 domain/API tests passed (13 existing tests and 9 Ring contract tests), and all seven recipient recovery checks passed. A separate desktop/mobile browser batch passed connection, missing-media recovery, private reference import, Ring timestamp-locked human approval, recipient image exclusion and disconnect cleanup. Screenshots and results are under `.impeccable/review/ring-*`. All provider responses in these checks were synthetic contract fixtures, not an official simulator or live Ring device.

### Official Playground verification — 28 September 2026

Amazon Developer registration and Playground access completed. Official device discovery returned HTTP 200, and the Package simulation created a WHEP session with HTTP 201 and visibly streamed the provided clip. Aperture's initial 24-hour image request failed with `TIME_RANGE_NOT_AUTHORIZED`. Requests now start no earlier than the current verified connection; offline discovery status no longer blocks stored-media retrieval. Ring remains authoritative for availability, and unchanged source-time checks control answer freshness.

The official image request now returns HTTP 303. Its signed download used `download-ap-northeast-1.prod.phoenix.devices.amazon.dev`, observed directly in Ring's authenticated redirect. The isolated verification server allowed that exact host through `RING_MEDIA_HOSTS`, without forwarding the bearer token. The download returned HTTP 416 `MEDIA_NOT_FOUND`, including after the simulated live view ended. This verifies real discovery and image-request authorization, but not image retrieval or a complete Ring-backed answer. A streaming simulation is not proof of an archived image.

All 24 domain/API tests and the TypeScript/production build passed. Tests include pre-consent window regression and stored-footage access for an offline camera. These automated tests still use clearly identified fixtures.

### Private Ring live view

The Ring source page now plays an authorized WHEP video stream in the owner's private workspace. Start a Playground event and connect in Aperture while that event is active. The backend checks the discovered device/module, keeps bearer credentials and Ring session URLs private, and expires sessions after two minutes. The browser receives video only; recipient endpoints expose no stream.

Official Package simulation playback inside Aperture was visually verified on 28 September. All 29 tests and the production build passed. Archived snapshot retrieval still returns MEDIA_NOT_FOUND for the tested Playground events, so live-view success does not establish a complete snapshot-backed answer or submission readiness. See RING-DEMO.md for reproduction and simulator-media attribution.

### Live-frame references and cautious review — 29 September 2026

When archived media is unavailable, play the authorized source and select **Use this frame as a private reference**. The browser submits a single frame to Aperture, which strips metadata and stores a private JPEG. This is a browser-saved image associated with an authorized stream; the server cannot authenticate the submitted pixels or infer when Ring recorded them. It is labeled separately from the official image-download API. The Ring watermark is not intentionally cropped.

A recipient check can now open **Start private live view** beside the original reference. Its camera/module is locked to that reference. Select **Save frame for this review**, inspect it, then approve **Cannot verify**. The recipient receives no image, device identifier, stream address or private note. They see the finite result, the missing source timestamp and the owner approval time, explicitly distinguished from recording time. Changing the submitted result to “Visible” cannot bypass the server's abstention rule.

Live check sessions end no later than the pass expiry, two-minute check deadline or Ring connection expiry. Revoking a pass, deleting its reference, completing a check, disconnecting or signing out closes associated streams and removes temporary review frames. A delayed stream negotiation or image decode rechecks access before returning a usable result. A reference frame remains available for five minutes while being edited; saving it removes the temporary copy. If a capture response arrives after the owner stops or leaves that view, the browser requests deletion of that exact temporary frame. The five-minute limit remains a fallback if the browser closes or the cleanup request fails. Persisted references and review evidence remain private until their reference is deleted.

This path demonstrates a useful privacy boundary, not verified current-world visibility. For a definite Ring-backed answer, use the existing snapshot path with a recent Ring capture timestamp. Personal direct observations remain a separately labeled manual workflow and should never be used to relabel an unverified video timestamp.

The official Package live-frame workflow was verified on 29 September, 21:14–21:18 IST: reference creation, a 15-minute/two-check pass, recipient request, owner review, **Cannot verify** with null source time and separate approval time, second pending check, revocation and Ring disconnect. The recipient view was another tab in the same browser; separate-account isolation is covered by API tests. This establishes the simulator refusal path, not physical-device behavior, archived-image availability or real-world current visibility. See `RING-DEMO.md` for the exact evidence boundary.
