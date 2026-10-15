# Try Aperture

Aperture lets a person waiting for a parcel ask a bounded question about its approved location without receiving the owner's camera feed. The owner approves every answer.

## Current live recording path

Use [the environment-only capture runner and 2:45 live shot list](LIVE-DEMO.md). Official snapshot `X-Media-Timestamp` supports a fresh owner-reviewed Visible/Not visible answer. Today's live run needs a current authorized token; the existing stills video and 11 October HTTP receipts are historical. The runner never substitutes test fixtures or chooses an answer.

## Official Ring Playground walkthrough

Use Node 22.13 or newer. The authenticated Ring redirects observed in the September and October runs used the two exact download hosts below. Install, build and start locally with those destinations allowed:

```sh
npm ci
npm run build
RING_MEDIA_HOSTS=download-ap-northeast-1.prod.phoenix.devices.amazon.dev,download-eu-south-2.prod.phoenix.devices.amazon.dev npm start
```

Open http://localhost:4332 and create a local account. In the [official Ring Developer Playground](https://developer.amazon.com/ring/console/playground), obtain your own authorized short-lived token. Aperture does not provide shared credentials or generate substitute Ring footage. Keep the token and signed download URLs out of screenshots and public evidence.

1. Open **Ring source**, connect the token and select its discovered camera and exact module, if present. Start an authorized Playground event that provides recorded images; the image API retrieves existing media rather than creating a new snapshot.
2. Choose **Fetch reference image**. Inspect the private image, name one object and mark its approved area before saving the reference.
3. Create an expiring pass with one check, open its link in another browser session and request a check.
4. In the owner view, open **Requested checks**. The check snapshot looks back only 60 seconds: start a new authorized Playground event that provides recorded images immediately before choosing **Fetch Ring snapshot**. If Ring returns `425 RECORDING_NOT_READY`, wait and explicitly fetch again while the check and token remain valid. Review the separate fresh image against the reference and approve only the supported finite answer. Missing, unknown or stale Ring capture time requires **Cannot verify**. A simulator image demonstrates the integration; it does not establish a real parcel's state.
5. Read the result and source time in the recipient view, reload to confirm the same check recovers without another budget charge, then revoke the pass and verify that further reads stop. The recipient never receives private images or the owner's note.

If Ring returns another download host, verify the exact hostname in the authenticated response before adding that single host and restarting the server. Do not guess hosts or broadly allow domains. For `MEDIA_NOT_FOUND`, readiness delays, expired tokens and the live-frame refusal path, follow [the acceptance checklist](RING-ACCEPTANCE.md). Full production OAuth account linking is not implemented.

## Manual workflow without Ring credentials

1. Follow the [local setup](../README.md#run-locally), create an account and add a reference image you may use. Mark the approved area and name one object.
2. Create an expiring pass with one check and open its link in another browser session. Request a check from the recipient view.
3. In the owner view, open **Requested checks**. Record a current human observation with its actual time and approve the answer. The recipient receives a finite result and timestamp; private imagery stays with the owner.
4. Reload the recipient view. The same check recovers without another budget charge. Revoke the pass and confirm that further reads stop.

## Verified evidence and limits

Discovery, live view and private browser-frame capture were demonstrated in the [public Ring video](https://www.youtube.com/watch?v=WLnjM5z7IPQ). A browser-saved frame has no verified Ring capture time, so it releases **Cannot verify**. It cannot establish that the parcel is currently present or absent. Snapshot requests returned `MEDIA_NOT_FOUND` in that official run.

The browser CI separately checks a timestamped snapshot contract using synthetic provider responses, plus recipient reload, retry and revocation. Those fixtures establish adapter behavior. Separately, an official Playground check on 11 October used the real adapter to complete discovery (200), image redirect (303) and image download (200), with verified fresh source time and recording origin. A subsequent disposable local HTTP run also created the reference and pass, fetched a fresh official observation, released `visible` after operator image review by Codex, verified that the recipient received no imagery, camera identifiers or owner note, and checked HTTP 410 after revocation. This proves the real local HTTP flow; it is not hosted/browser validation, automated recognition or a new video. Use [the acceptance checklist](RING-ACCEPTANCE.md) for the remaining hosted/browser walkthrough, exact observed download hosts and provider error handling. See [the friction log](FRICTION-LOG.md).

The privacy cutaway explains which information crosses the permission boundary. Physical device behavior and real parcel handoffs have not been tested. A not-visible answer does not prove theft or collection.
