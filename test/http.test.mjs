import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createApp } from "../server/index.mjs";
import { Store } from "../server/store.mjs";
test("HTTP boundaries: accounts, session cookies, CSRF, upload sanitation, privacy and malformed requests", async () => {
  const store = new Store();
  const app = await createApp({ store, origin: "https://aperture.example" });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (
    path,
    method = "GET",
    body,
    session = "",
    requestOrigin = "https://aperture.example",
  ) =>
    fetch(origin + path, {
      method,
      headers: {
        Origin: requestOrigin,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Cookie: session } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal((await call("/api/workspace")).status, 401);
    assert.equal(
      (
        await call(
          "/api/register",
          "POST",
          {
            name: "Owner",
            email: "owner@test.dev",
            password: "a long enough password",
          },
          "",
          "https://evil.example",
        )
      ).status,
      403,
    );
    let res = await call("/api/register", "POST", {
      name: "Owner",
      email: "owner@test.dev",
      password: "a long enough password",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie"), /HttpOnly/);
    assert.match(res.headers.get("set-cookie"), /SameSite=Strict/);
    assert.match(res.headers.get("set-cookie"), /Secure/);
    const session = res.headers.get("set-cookie").split(";")[0];
    assert.equal((await call("/api/cameras", "POST", {}, session)).status, 400);
    assert.equal(
      (await call("/api/cameras", "POST", null, session)).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/api/cameras",
          "POST",
          { image: "data:image/svg+xml;base64,PHN2Zz4=" },
          session,
        )
      ).status,
      400,
    );
    const image = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#666" },
    })
      .png()
      .toBuffer();
    const cbody = {
      name: "Private reference",
      object: "the object",
      area: "the marked area",
      region: { x: 0, y: 0, width: 1, height: 1 },
      consent: true,
      image: `data:image/png;base64,${image.toString("base64")}`,
    };
    res = await call("/api/cameras", "POST", cbody, session);
    assert.equal(res.status, 201);
    const c = await res.json();
    assert.equal((await call(`/api/cameras/${c.id}/image`)).status, 401);
    res = await call(`/api/cameras/${c.id}/image`, "GET", undefined, session);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    const output = await res.arrayBuffer();
    assert.equal((await sharp(Buffer.from(output)).metadata()).exif, undefined);
    res = await call(
      "/api/passes",
      "POST",
      {
        cameraId: c.id,
        label: "Owner-only label",
        minutes: 30,
        budget: 2,
        cooldown: 60,
        consent: true,
      },
      session,
    );
    const p = await res.json();
    res = await call(`/api/p/${p.token}`);
    const publicView = await res.json();
    assert.ok(!JSON.stringify(publicView).includes("Owner-only"));
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.equal(res.headers.get("cache-control"), "no-store");
    res = await call(`/api/p/${p.token}/checks`, "POST", {
      requestKey: "test-request",
    });
    assert.equal(res.status, 201);
    const job = await res.json();
    res = await call(
      `/api/checks/${job.id}/complete`,
      "POST",
      {
        result: "visible",
        observedAt: Date.now(),
        confirmed: true,
        note: "Very private note",
      },
      session,
    );
    assert.equal(res.status, 200);
    res = await call(`/api/p/${p.token}/checks/${job.id}`);
    const answer = await res.json();
    assert.equal(answer.result, "visible");
    assert.ok(!JSON.stringify(answer).includes("private"));
    assert.ok(!("image" in answer));
    await call(`/api/passes/${p.id}/revoke`, "POST", {}, session);
    assert.equal(
      (await call(`/api/p/${p.token}/checks/${job.id}`)).status,
      410,
    );
    await call("/api/logout", "POST", {}, session);
    assert.equal(
      (await call("/api/workspace", "GET", undefined, session)).status,
      401,
    );
  } finally {
    await app.close();
    store.close();
  }
});
