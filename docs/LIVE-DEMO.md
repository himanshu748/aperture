# Live Ring demo (2 minutes 45 seconds)

## Capture time and honest outcomes

[Ring's official Image Snapshots documentation](https://developer.amazon.com/docs/ring/api-documentation.html#image-snapshots) defines `X-Media-Timestamp` as the captured frame time in epoch milliseconds and `X-Media-Origin` as recording or snapshot. Event timestamps describe events; they do not establish the capture time of a different browser-saved frame. Aperture already consumes the snapshot header in `RingSessions.snapshot`, validates the request window and locks source time during owner review. A fresh approved `visible` is a bounded Yes; `not_visible` is a bounded No. Neither proves theft, collection or global absence.

Use timestamped official snapshots for the definite-answer demo. Keep timestamp-free live-frame abstention intact. No owner-attestation bypass is needed or implemented because an official source-time field exists.

## Environment and preflight (about 10 minutes)

Requires Node 22.13+, npm and Playwright Chromium. On a clean clone:

```sh
npm ci
npm run build
npx playwright install chromium
```

In your own terminal, set `RING_PLAYGROUND_TOKEN` to a current authorized short-lived Playground token and `APERTURE_DEMO_PASSWORD` to a private password with at least 12 characters. Use a secure environment injection method or a silent shell prompt; never put credential values in a command argument, shell history, recording, committed `.env` or chat. The runner reads environment variables only. It starts an isolated in-memory app/account at http://127.0.0.1:4432, leaving the normal database untouched.

The authenticated redirects in the dated prior runs used these exact hosts. Only add another exact host after verifying it from Ring's authorized redirect; never wildcard the domain:

```sh
export RING_MEDIA_HOSTS=download-ap-northeast-1.prod.phoenix.devices.amazon.dev,download-eu-south-2.prod.phoenix.devices.amazon.dev
npm run demo:ring
```

The runner does not open, edit or automate the Ring console or any submission form. Before recording, prepare an official Package simulation/device recording yourself. **Fetch reference image** reads existing recorded media; it does not trigger a snapshot. The new recipient request needs a separate recording less than 60 seconds old, created after the current token connection. Keep the actual Playground event within the granted window.

The owner page starts at Ring source with real discovery already connected. Create the reference/pass in the UI; the runner opens that generated bearer link in an isolated recipient tab without printing it. You operate all app controls and approve the image. The runner does not choose the object, approved region or answer.

## Shot list (2:45)

| Time | Record live | Why |
| --- | --- | --- |
| 0:00–0:15 | Connected Ring source and discovered official camera | Real official discovery, not a test fixture. |
| 0:15–0:40 | Fetch reference image, display Ring provenance, mark one actual object/area | Actual REST snapshot retrieval and bounded scope. |
| 0:40–1:05 | Save reference and create one-check expiring pass | Owner chooses exactly what can be asked. |
| 1:05–1:20 | Recipient requests a check in the second tab | Real independent recipient session. |
| 1:20–1:50 | Owner fetches a fresh official snapshot; show source capture time and review the object | Separate current observation with Ring source time, not download time. |
| 1:50–2:10 | Owner chooses Visible/Not visible only if the picture supports it and confirms release | Explicit owner approval. If stale/unknown, keep Cannot verify and record the failure honestly. |
| 2:10–2:30 | Recipient receives the finite result and source time; reload | No imagery, owner note or extra budget charge. |
| 2:30–2:45 | Revoke pass and show denial | End the granted access and state simulator/device scope. |

Press Enter in the runner's terminal to finish; it also stops after 175 seconds. Owner and recipient WebM tracks plus `receipt.json` are written under ignored `.impeccable/review/live-ring/<UTC>/`. Use actual moving app footage from these tracks or a desktop screen recorder. No still-image reconstruction. The script saves no screenshots, HAR, traces, bearer URLs or request bodies. The videos contain private images and pass-link UI; review/redact access links before sharing, without hiding runtime provenance or failures. Do not upload raw footage automatically.

The sanitized receipt contains only operation/status, frame provenance/time and recipient outcome/time. `complete_flow_verified` requires at least two retrieved frames, a verified fresh last frame and a definite Ring-review recipient result. It does not grade the recording, prove physical hardware or replace inspection. Runtime failure writes an incomplete receipt and never falls back to fixture transport. Repeated identical blocking failures: stop after two, record the cause and owner action in FRICTION.md.

## Errors

`401`: renew the token yourself. `416 MEDIA_NOT_FOUND`: prepare an authorized recorded event; WHEP playback alone does not prove archived availability. `425 RECORDING_NOT_READY`: wait, explicitly fetch again within the live request window. Unapproved download host: verify the exact redirect host and restart with a narrow allowlist. Never use download time, an event time, a watermark guess or an edited still as replacement source-time proof.

## Current verification

The 11 October official provider/HTTP receipts in `docs/evidence/` are retained as dated historical records. This 15 October runner has syntax/preflight and contract-regression checks only until current credentials are connected. No new live run, new live video, hosted verification or physical-device result is claimed.
