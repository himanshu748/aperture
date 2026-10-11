# Verify the timestamped Ring image path

The official Package Playground demonstrated discovery and private live playback in Aperture on 28 and 29 September. Its recorded-image requests returned `MEDIA_NOT_FOUND`. On 11 October, a fresh official run through the real adapter completed discovery (200), image redirect (303) and image download (200), with verified fresh source time and recording origin. A subsequent local HTTP run completed the owner/recipient sequence, including operator image review by Codex, a `visible` recipient result with no private fields and HTTP 410 after revocation. Hosted/browser verification remains open; neither local run is a new recorded UI demonstration.

## Prepare the local run

Follow [the setup](../README.md#run-locally). Ring credentials remain in server memory for the connection lifetime. Use only an authorized, short-lived Playground token.

Authenticated Ring redirects used `download-ap-northeast-1.prod.phoenix.devices.amazon.dev` on 28 September and `download-eu-south-2.prod.phoenix.devices.amazon.dev` on 11 October. To permit these two observed destinations, start the server with:

```sh
RING_MEDIA_HOSTS=download-ap-northeast-1.prod.phoenix.devices.amazon.dev,download-eu-south-2.prod.phoenix.devices.amazon.dev npm run dev
```

This setting permits only those two additional download hosts; it does not make a recording available. If your authenticated Ring response uses a different host, verify its exact hostname before adding it. Do not allow an arbitrary domain, forward the bearer to the download host, or publish the signed URL.

## Provider step verified on 11 October

[Sanitized provider receipt](evidence/aperture-oct11-official-ring.json).

The real adapter returned `sourceTimeVerified: true`, `fresh: true`, `mediaOrigin: recording` and capture time `2026-10-11T01:42:56.445Z` after decoding the downloaded image. The standalone check did not use Aperture's reference/pass/recipient UI or release any answer. Preserve that boundary for this first adapter check; the separate HTTP sequence below provides stronger application-flow evidence. Earlier media failures are historical receipts, not evidence that every subsequent event must fail.

## Local HTTP sequence verified on 11 October

[Sanitized local HTTP flow receipt](evidence/aperture-oct11-official-flow.json).

The actual app routes and Ring adapter retrieved fresh timestamped reference and check images from official Playground events. Codex visually inspected the images in the operator role and approved `visible`. The recipient response contained exactly `id`, `state`, `result`, `observedAt`, `completedAt` and `provider`, including the Ring observation timestamp and `ring-snapshot-owner-review`. It excluded images, camera identifiers and the owner note. Revoking the pass made the same check return 410. This run used a disposable local workspace, not hosted/browser interaction; the app still does not automate recognition.

## Remaining hosted/browser acceptance sequence

1. Connect in **Ring source** with authorization consent. Choose the discovered camera and its exact module, if present.
2. Start an authorized event or live view. The image API retrieves existing media; it does not create a fresh snapshot. Check that the chosen source provides recorded images.
3. Fetch a private reference after connecting. Aperture bounds the reference window to the verified connection and at most one day. Name one object and mark its permitted area.
4. Create a short-lived pass and open it in a separate recipient session. Request a check.
5. Fetch the requested check's Ring snapshot. Its source window is the last 60 seconds. Review the image against the reference before choosing an answer.
6. Verify that the recorded source time and media origin came from Ring. A download time or owner approval time cannot establish image freshness. Missing, unknown or stale capture time must yield **Cannot verify**.
7. Release the approved answer, reload the recipient, then request another check and revoke the pass. Confirm that the pending check cannot release an answer and recipient access closes.

## Interpret a failed fetch

| Result | Next step |
| --- | --- |
| Expired or rejected token | Generate a new authorized token and reconnect. |
| Unapproved media host | Verify the authenticated redirect's exact hostname and restart with that single host allowed. |
| `416 MEDIA_NOT_FOUND` | No recording exists in the requested range. Verify source coverage and event timing; widening the window does not prove freshness. |
| `425 RECORDING_NOT_READY` | Wait and explicitly fetch again while the check and token remain valid. |
| Rate limit or temporary provider failure | Wait before retrying. Do not release an observation from the failed request. |
| Live video works but recorded image fails | Use the documented live-frame refusal path. Keep capture time unknown. |

Record the date, event type, HTTP result, presence of source-time/origin metadata, released outcome and revocation result. Keep tokens, signed URLs and private images out of public evidence. A successful timestamped download still requires owner review; Aperture does not automate recognition.

See the [official API reference](https://developer.amazon.com/docs/ring/api-documentation.html), [recorded demonstration and limits](../RING-DEMO.md), and [friction log](FRICTION-LOG.md).
