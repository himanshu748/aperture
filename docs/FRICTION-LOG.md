# Aperture: Ring integration friction log

Observed during the 28–29 September 2026 implementation and official Ring Developer Playground checks. These entries describe this project's requests and observations, not a claim that every Ring integration has the same behavior. The test source was the official Package simulation; no physical Ring device was used.

## 1. A historical image request crossed the current authorization window

**Task:** Retrieve a private reference image after connecting a Playground token.

**Steps:** Connected a valid token, discovered the permitted device/module, and requested the latest stored image using an initial 24-hour interval.

**Expected:** An authorized stored image, or an indication that the requested interval had no media.

**Actual:** Ring returned `TIME_RANGE_NOT_AUTHORIZED`. Aperture's initial interval began before the current connection was verified. This was a mistake in my request-window construction.

**Severity:** Important. Device discovery succeeded, but the first reference request could not proceed.

**Workaround:** Bound reference requests to start no earlier than the current verified connection time, with a maximum 24-hour window. Bound each check to the last 60 seconds and the same connection boundary. The corrected official request reached the image-download redirect.

**Suggestion:** Add a Playground example that constructs an image-request interval from a newly authorized session and explains the authorization boundary beside the token instructions. If the API can expose the earliest authorized media time, include it in a documented response field or error detail.

## 2. A live browser frame did not carry a verified capture timestamp

**Task:** Use an official live-view frame as evidence for a recipient's object-visibility check.

**Steps:** Played the Package simulation through Ring WHEP inside Aperture, saved a browser frame privately, and reviewed another frame for a pending check.

**Expected:** A documented way to associate the saved frame with the time Ring recorded that frame, so the app could evaluate freshness.

**Actual:** The WHEP/browser-frame path used in this integration supplied no verified Ring capture timestamp. The browser save time established when Aperture copied the pixels, not when Ring recorded them. The simulator can play prerecorded footage.

**Severity:** Critical for this project's definite visibility answers. Private review still worked, but source freshness could not be established.

**Workaround:** Label the frame as a browser-saved live-view image, preserve unknown capture time, and require **Cannot verify** on the server. Show approval time separately. The owner can still create a reference, review the request privately, release the conservative result, and revoke the pass.

**Suggestion:** Document whether live-view clients can obtain per-frame capture time and how its trust relates to the image-download headers. If supported, provide a sample connecting a frame to provider-origin metadata. Otherwise, explicitly document that browser capture time must not stand in for camera capture time.

## 3. A successful image redirect led to unavailable archived media

**Task:** Download a Ring image from a Playground event through the documented image-download flow.

**Steps:** Started the official Package simulation, requested an image within the authorized interval, followed the HTTP 303 to the observed signed HTTPS media host, and retried after the live view ended. The Ring bearer token was not forwarded to the download host.

**Expected:** A downloadable image with Ring capture/origin metadata, or clear documentation that this simulated event does not populate the archived-image endpoint.

**Actual:** The media download returned HTTP 416 `MEDIA_NOT_FOUND` in the tested windows, while live WHEP playback worked. A playable stream did not establish that an archived image existed. I have not established whether this is expected simulator coverage, event timing, or another media-availability condition.

**Severity:** Important. It blocked the definite snapshot-backed answer in the official simulator demonstration.

**Workaround:** Keep the failure visible, retain the snapshot implementation for further verification, and use the private live-frame review path with a mandatory **Cannot verify** answer. Synthetic contract tests exercise timestamped snapshot responses but do not replace official media evidence.

**Suggestion:** Publish a Playground capability table covering discovery, live view, recorded images, and supported event types. Add a reproducible timestamped-image fixture or a clear “live view only” indicator, with a short diagnostic guide for `MEDIA_NOT_FOUND` and any documented readiness delay.

## Reference implementation

Source and reproduction instructions: https://github.com/himanshu748/aperture

Official API documentation: https://developer.amazon.com/docs/ring/api-documentation.html

The app keeps credentials and signed media URLs out of this log. None of the entries establishes physical-device behavior, automated recognition, or real-world current visibility.
