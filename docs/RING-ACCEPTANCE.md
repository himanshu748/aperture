# Verify the timestamped Ring image path

The official Package Playground demonstrated discovery and private live playback in Aperture on 28 and 29 September. Its recorded-image requests returned `MEDIA_NOT_FOUND`. This checklist remains open; synthetic contract tests cannot close it.

## Prepare the local run

Follow [the setup](../README.md#run-locally). Ring credentials remain in server memory for the connection lifetime. Use only an authorized, short-lived Playground token.

The earlier authenticated Ring redirect used the exact host `download-ap-northeast-1.prod.phoenix.devices.amazon.dev`. For that observed destination, start the server with:

```sh
RING_MEDIA_HOSTS=download-ap-northeast-1.prod.phoenix.devices.amazon.dev npm run dev
```

This setting permits one download host; it does not make a recording available. If your authenticated Ring response uses a different host, verify its exact hostname before adding it. Do not allow an arbitrary domain, forward the bearer to the download host, or publish the signed URL.

## Run the acceptance sequence

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
