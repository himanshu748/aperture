# Aperture Ring demonstration and evidence

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

The image-download API retrieves existing recorded media; it does not start recording or create a fresh snapshot. Start an authorized live view or the relevant official simulated event before requesting media. If Ring returns 416, the UI explains that no recorded image is available. Whether the official simulator makes its frames available through this snapshot endpoint remains unverified; a documented live-view simulation is not evidence of snapshot availability.

The remaining acceptance check for a definite snapshot-backed answer is: token → discovered device/module → official event or live view → downloaded image with `X-Media-Timestamp` and `X-Media-Origin`. Preserve the provider request ID privately. If that gate fails, record the returned status without its bearer token or signed URL. The verified live-frame fallback below must retain its explicit unknown-time and **Cannot verify** result.

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
