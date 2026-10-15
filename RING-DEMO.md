> 15 October: use [the live capture runner and 2:45 shot list](docs/LIVE-DEMO.md) for replacement moving app footage. The public video below contains edited stills. A current token and fresh recorded media are required; no new live run is claimed.

# Aperture Ring demonstration and evidence

Update on 11 October 2026: a separate local HTTP run completed official timestamped reference and check downloads, operator image review by Codex, a finite `visible` recipient response and revocation. It used the real app routes and Ring adapter without mocked provider responses. It was not a hosted/browser walkthrough or a new video; the September demonstration below remains the conservative live-frame recording.

Status on 29 September 2026: the official Package Playground flow was verified end to end in Aperture, from Ring WHEP playback to a browser-saved private reference, a recipient request, owner review, a conservative answer and revocation. The live frame has no verified Ring capture timestamp, so the answer was **Cannot verify**. The archived image endpoint returned `MEDIA_NOT_FOUND` in the earlier tested simulation windows; a definite snapshot-backed answer remains verified only with synthetic contract fixtures.

[Watch the public demonstration](https://www.youtube.com/watch?v=WLnjM5z7IPQ): 108.8 seconds of edited verified browser stills, with Deepgram Aura 2 Thalia narration and English captions. It shows the conservative live-frame workflow below; it is not a continuous recording or physical-device demonstration. The final reviewed suite passes 38 tests. The [friction log](docs/FRICTION-LOG.md) records the three observed integration issues and proposed improvements.

## Runtime path that is implemented

1. In the private workspace, open **Ring source**. Use a short-lived token generated in the official Ring Developer Playground. Aperture verifies it by calling `GET https://api.amazonvision.com/v1/devices?include=status,capabilities`.
2. Choose a returned camera and, where required, one camera module. Fetch a private reference with the official image-download endpoint. The server requests the latest stored image after the current connection was verified (up to one day), follows the documented 303 response, and downloads the image without forwarding the Ring token.
3. Name one object, mark its permitted area, approve disclosure and create a short-lived pass. This binds the reference to the exact discovered device/module.
4. Open the recipient pass in a separate browser. Request a check. In the owner’s Requested checks, use **Fetch Ring snapshot**. This download is restricted to the last 60 seconds. No image reaches the recipient.
5. Review the new image against the reference and choose the finite result. Ring’s `X-Media-Timestamp` supplies the captured-frame time; the UI does not let the owner replace it. Missing, unknown, out-of-window or stale source timing can release only **Cannot verify**.
6. Release the approved answer. The recipient sees the finite outcome, source time and explicit human-review provenance. The owner’s private record retains the image and source metadata.
7. For the revocation sequence, request another check and revoke the pass before releasing its answer. Pending downloads and final release both recheck the pass. Record the actual blocked recipient view.

## Official Playground access

The official sample documents a 30-minute Playground token without app registration, OAuth configuration or client credentials. Ring’s May 28 release notes describe Package, Vehicle and Motion live-view simulations using WebRTC/WHEP. Use those controls only where the signed-in official Playground actually provides them.

The image-download API retrieves existing recorded media; it does not start recording or create a fresh snapshot. Start an authorized live view or the relevant official simulated event before requesting media. If Ring returns 416, the UI explains that no recorded image is available. A separate official adapter check on 11 October successfully downloaded a fresh timestamped recording; this does not guarantee media availability for every simulated event. A documented live-view simulation alone is not evidence of snapshot availability.

The provider and local HTTP portions passed on 11 October: token → discovered camera → official reference image → pass and recipient request → fresh official check image → operator image review by Codex → finite recipient answer → revocation. The remaining validation is a hosted/browser walkthrough of that snapshot-backed flow; no such walkthrough or new recording is claimed. Preserve the provider request ID privately. If that gate fails, record the returned status without its bearer token or signed URL. The verified live-frame fallback below must retain its explicit unknown-time and **Cannot verify** result.

## Original recording target

- Show the official Ring Playground or authorized physical device, then Aperture discovering that same source.
- Mark a narrowly scoped object and create its pass.
- Show a real source image arriving through Aperture, human approval and the separate recipient’s finite answer.
- Demonstrate an actual uncertain/stale case and a revoked pass. State that recognition is performed by the owner.

The completed walkthrough is linked above. Its source-time limit and edited-stills format are explicit. Contract-fixture captures are not official simulator evidence, and the video contains no credentials or signed download URLs. It does not imply automated recognition or a submitted Devpost entry.

## Observed friction and next validation

- This process had no `RING_ACCESS_TOKEN` or `RING_CLIENT_ID`; the project had no local environment file supplying one. No token was retrieved or inferred from unrelated apps.
- The public Playground URL did not provide an anonymous usable session during this check. Signed-in access is still required before obtaining real runtime evidence.
- The documented distinction between capture time and download time motivated the timestamp lock and conservative abstention path.
- The documented multi-camera ambiguity motivated mandatory module selection from discovery, rather than accepting a typed module or silently choosing one.
- Customer feedback and pickup-task value have not been validated. Compare the pass with ordinary pickup messaging when an operator becomes available.

## Primary sources checked

- [Official Ring API documentation](https://developer.amazon.com/docs/ring/api-documentation.html): no official Partner SDK, device discovery, component selection, image-download flow and captured-frame headers.
- [Official Ring sample](https://github.com/AmazonAppDev/ring-api-helloworld): Playground token setup and live-view workflow.
- [Ring release notes](https://developer.amazon.com/docs/ring/release-notes.html): official Playground event simulation.

## Verified private live view

Choose the discovered source, start an event in the official Ring Playground, then select **Start private live view** in Aperture while the event is active. The authenticated backend negotiates the WHEP session. Only the signed-in owner receives its SDP answer; bearer credentials and upstream session URLs stay on the server. The browser receives video only. Stop, navigation away, disconnect and the two-minute server lifetime close the session. A private video stream does not create an archived reference or release a recipient answer.

The official Package stream played inside Aperture on 28 September. The 29-test suite and production build pass, including session isolation, invalid-location rejection, cancellation and lifetime tests. The extra offline pagination tests in the separate official-sample contribution are not part of this count.

Package simulation credit: “Thief stealing our package” by frollard, https://www.youtube.com/watch?v=TfTFu8lGrwk, CC BY 4.0 https://creativecommons.org/licenses/by/4.0/. Ring provides a clipped version; preserve this credit in demo media.

## Live-frame review path added 29 September

The live view supplies a private reference without depending on archived images. On 29 September 2026, 21:14–21:18 IST, the following flow was exercised through the official Package Playground in the updated Aperture UI:

1. Connect an authorized Playground token and choose its discovered camera/module. Start a Package event in the official Playground, then start Aperture's private live view.
2. While the video plays, select **Use this frame as a private reference**. Name one object and mark its approved area. The reference provenance says “Ring live view · browser-saved frame” and “Timestamp unavailable.”
3. Create a 15-minute pass with two checks and open its bearer link in a recipient tab in the same browser. Request one check.
4. In the owner check, start a second authorized Playground event if needed and open the reference-bound live view. Select **Save frame for this review**. Review the area and approve **Cannot verify**.
5. Show the recipient's finite answer: no image, no stream, unknown frame time, and a separately labeled owner approval time. Explain that a live-view frame can be a replay and that the WHEP path supplied no verifiable recording timestamp.
6. Request the second check and revoke the pass while it is pending. Confirm that the recipient displays closed access, then disconnect Ring in the owner workspace.

This is an honest fallback demonstration. It does not establish real-time object visibility or automated recognition. To demonstrate a definite Ring-backed “Visible” answer, capture an actual recent image through the documented snapshot endpoint; do not relabel the browser save time as the Ring capture time. Synthetic HTTP tests cover the implementation's boundaries, not official simulator behavior. Preserve the Package clip attribution above in any final video.

### Evidence and limits of the 29 September run

The recipient rendered **Cannot verify**, an unavailable Ring frame capture time and a separately labeled owner approval time. After the second request, revocation closed the recipient view. Evidence screenshots are saved privately as `aperture-ring-recipient-verified.png` and `aperture-ring-revocation-verified.png` in the coordinating task's outputs folder. The run used a recipient tab in the same browser, not an anonymous or separately authenticated browser session. Separate automated account-isolation tests cover unauthorized API access; this UI run does not replace those tests.

The run established the official-simulator live-frame review and refusal path. It did not establish archived-media availability, current-world object visibility, automated recognition, physical Ring hardware behavior, hosted judge access or a submitted entry. The public edited walkthrough was produced afterward and is linked above. The journal initially displayed an epoch date for its null source timestamp; the rendering now keeps source time unavailable, distinguishes live Ring review from manual observation, and labels approval time separately. That display repair does not change the released answer or stored timestamps.

## Official provider check — 11 October 2026

[Sanitized provider receipt](docs/evidence/aperture-oct11-official-ring.json).

A standalone harness called the repository's real `RingSessions.connect` and `RingSessions.snapshot` methods using native `fetch` and a fresh authorized official Playground token. It discovered one camera with no separate components (HTTP 200), received the image endpoint's HTTP 303 redirect, and downloaded an image (HTTP 200). The adapter decoded and normalized it, returning verified source time, `fresh: true`, recording origin, and capture time `2026-10-11T01:42:56.445Z`. The run began at `2026-10-11T01:42:19.776Z`; that start time is not the capture or download time.

The exact observed media host was `download-eu-south-2.prod.phoenix.devices.amazon.dev`. The harness allowed that host and the previously observed AP host explicitly, without forwarding the Ring bearer to either. No bearer, signed URL or private image is included in this record. This closes the previously unverified official timestamped-download step for this run only. The harness did not create a reference or pass, approve an observation or release a recipient answer. Full snapshot-backed UI acceptance remains open. It provides no physical-device or actual parcel-visibility proof and does not change browser-frame abstention.

## Full local HTTP provider flow — 11 October 2026

[Sanitized local HTTP flow receipt](docs/evidence/aperture-oct11-official-flow.json).

A second harness started a disposable in-memory Aperture workspace and called the real HTTP routes with native `fetch`. It used official Playground discovery and two successful recorded-image downloads: one for the saved reference, then one for a recipient check. Each image request returned 303 and each media download returned 200. Both images passed the adapter's verified-source-time and freshness checks with recording origin. Reference capture time was `2026-10-11T01:50:34.243Z`; observation capture time was `2026-10-11T01:51:13.361Z`.

Codex visually inspected the private reference and observation images in the operator role before approving `visible`. This was an explicit review step outside the app's implementation, not automated object recognition by Aperture or a human-review claim. The recipient HTTP result had exactly six fields: `id`, `state`, `result`, `observedAt`, `completedAt`, and `provider`. It reported `visible` and `ring-snapshot-owner-review`; image data, camera identifiers and the owner note were excluded. Revocation changed the same recipient check to HTTP 410.

The run completed at `2026-10-11T01:51:32.257Z`. It verifies the complete local HTTP flow against real official simulator responses. It does not verify hosted operation, browser interaction, physical hardware or a real parcel's current visibility. No new video was made; the public September video still demonstrates the unknown-time browser-frame refusal path.
