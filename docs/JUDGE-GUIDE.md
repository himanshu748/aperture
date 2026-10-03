# Try Aperture

Aperture lets a person waiting for a parcel ask a bounded question about its approved location without receiving the owner's camera feed. The owner approves every answer.

1. Follow the [local setup](../README.md#run-locally), create an account and add a reference image you may use. Mark the approved area and name one object.
2. Create an expiring pass with one check and open its link in another browser session. Request a check from the recipient view.
3. In the owner view, open **Requested checks**. Record a current human observation with its actual time and approve the answer. The recipient receives a finite result and timestamp; private imagery stays with the owner.
4. Reload the recipient view. The same check recovers without another budget charge. Revoke the pass and confirm that further reads stop.

For the Ring path, use **Ring source** with your authorized official Playground token. Discovery, live view and private browser-frame capture were demonstrated in the [public Ring video](https://www.youtube.com/watch?v=WLnjM5z7IPQ). A browser-saved frame has no verified Ring capture time, so it releases **Cannot verify**. It cannot establish that the parcel is currently present or absent. Snapshot requests returned `MEDIA_NOT_FOUND` in that official run.

The browser CI separately checks a timestamped snapshot contract using synthetic provider responses, plus recipient reload, retry and revocation. Those fixtures establish adapter behavior; they do not establish a working timestamped snapshot from the official simulator. See [the friction log](FRICTION-LOG.md).

The privacy cutaway explains which information crosses the permission boundary. Physical device behavior and real parcel handoffs have not been tested. A not-visible answer does not prove theft or collection.
