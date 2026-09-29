// Browser regressions for pass-scoped check recovery. Uses an isolated in-memory server.
import { chromium } from "playwright";
import { createApp } from "../server/index.mjs";
import { Store } from "../server/store.mjs";
import { createServer } from "node:net";
import assert from "node:assert/strict";
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`,
  store = new Store();
const app = await createApp({ store, origin: base });
await new Promise((r) => app.server.listen(port, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const user = store.register({
  name: "Recovery test owner",
  email: "recovery@example.test",
  password: "recovery test password only",
}).user;
const camera = store.addCamera(
  user.id,
  {
    name: "Synthetic recovery reference",
    object: "the fixture object",
    area: "the approved fixture area",
    region: { x: 0, y: 0, width: 1, height: 1 },
    consent: true,
  },
  Buffer.from("synthetic fixture only"),
);
const makePass = () =>
  store.createPass(user.id, {
    cameraId: camera.id,
    label: "Recovery regression",
    minutes: 30,
    budget: 1,
    cooldown: 60,
    consent: true,
  });
const remaining = (p) => store.recipient(p.token).remaining;
const waitHeading = (page, name) =>
  page.getByRole("heading", { name, exact: true }).waitFor({ timeout: 12000 });
const errors = [],
  results = [];
const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  const p = makePass();
  let posts = 0;
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      req.url().endsWith(`/api/p/${p.token}/checks`)
    )
      posts++;
  });
  await page.goto(`${base}/p/${p.token}`);
  await page
    .getByRole("button", { name: "Request a check", exact: true })
    .click();
  await waitHeading(page, "Waiting for the owner’s view.");
  const job = store.workspace(user.id).pending[0];
  assert.equal(remaining(p), 0);
  await page.reload();
  await waitHeading(page, "Waiting for the owner’s view.");
  assert.equal(remaining(p), 0);
  assert.equal(posts, 1);
  results.push(
    "pending reload recovers the same check with a one-check budget and no POST",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage)[0])),
  );
  assert.deepEqual(Object.keys(saved).sort(), ["jobId", "requestKey"]);
  assert.equal(saved.jobId, job.id);
  let failedPoll = false;
  await page.route(`**/api/p/${p.token}/checks/${job.id}`, async (route) => {
    if (!failedPoll) {
      failedPoll = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "Connection interrupted" })
    .waitFor({ timeout: 10000 });
  assert.equal(
    await page
      .getByRole("heading", { name: "Waiting for the owner’s view." })
      .isVisible(),
    true,
  );
  assert.equal(remaining(p), 0);
  await page
    .getByRole("alert")
    .filter({ hasText: "Connection interrupted" })
    .waitFor({ state: "hidden", timeout: 10000 });
  assert.equal(posts, 1);
  results.push(
    "transient poll failure retains pending state and identifiers; next read recovers without spending",
  );
  store.complete(user.id, job.id, {
    result: "visible",
    observedAt: Date.now(),
    confirmed: true,
    note: "Private information",
  });
  await waitHeading(page, "Visible.");
  await page.unroute(`**/api/p/${p.token}/checks/${job.id}`);
  let release, arrived;
  const waiting = new Promise((r) => (arrived = r)),
    hold = new Promise((r) => (release = r));
  let first = true;
  await page.route(`**/api/p/${p.token}/checks/${job.id}`, async (route) => {
    if (first) {
      first = false;
      arrived();
      await hold;
    }
    await route.continue();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waiting;
  assert.equal(
    await page.getByRole("heading", { name: "Visible.", exact: true }).count(),
    0,
    "cached answer must not render before the authorized result response",
  );
  release();
  await waitHeading(page, "Visible.");
  assert.equal(remaining(p), 0);
  assert.equal(posts, 1);
  results.push(
    "completed reload waits for authorized scoped result; no answer cache or extra request",
  );
  store.revoke(user.id, p.id);
  await waitHeading(page, "This permission has closed.");
  assert.equal(
    await page.getByRole("heading", { name: "Visible.", exact: true }).count(),
    0,
  );
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  await page.reload();
  await waitHeading(page, "This permission has closed.");
  assert.equal(
    await page.getByRole("heading", { name: "Visible.", exact: true }).count(),
    0,
  );
  results.push(
    "revocation clears the rendered answer and saved identifiers and blocks reload recovery",
  );
  const p2 = makePass();
  const lost = await context.newPage();
  let dropped = false;
  await lost.route(`**/api/p/${p2.token}/checks`, async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await lost.goto(`${base}/p/${p2.token}`);
  await lost
    .getByRole("button", { name: "Request a check", exact: true })
    .click();
  await waitHeading(lost, "Waiting for the owner’s view.");
  assert.equal(remaining(p2), 0);
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS n FROM jobs WHERE pass_id=?")
      .get(p2.id).n,
    1,
  );
  results.push(
    "lost accepted POST response retries persisted request key idempotently",
  );
  await lost.close();
  const p3 = makePass();
  const unsupported = await context.newPage();
  await unsupported.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Storage disabled", "SecurityError");
      },
    }),
  );
  await unsupported.goto(`${base}/p/${p3.token}`);
  await unsupported
    .getByText(
      "This browser cannot save a check across reloads. Keep this tab open while waiting for the owner.",
    )
    .waitFor();
  await unsupported
    .getByRole("button", { name: "Request a check", exact: true })
    .click();
  await waitHeading(unsupported, "Waiting for the owner’s view.");
  assert.equal(remaining(p3), 0);
  results.push(
    "unavailable sessionStorage is handled without crashing; in-tab checking still works",
  );
  await unsupported.close();
  const p4 = makePass();
  const expiry = await context.newPage();
  await expiry.goto(`${base}/p/${p4.token}`);
  await expiry
    .getByRole("button", { name: "Request a check", exact: true })
    .click();
  await waitHeading(expiry, "Waiting for the owner’s view.");
  const expiryJob = store
    .workspace(user.id)
    .pending.find((j) => j.passId === p4.id);
  store.complete(user.id, expiryJob.id, {
    result: "visible",
    observedAt: Date.now(),
    confirmed: true,
  });
  store.db
    .prepare("UPDATE passes SET expires=? WHERE id=?")
    .run(Date.now() + 5000, p4.id);
  await waitHeading(expiry, "Visible.");
  await expiry.route(`**/api/p/${p4.token}`, (route) => route.abort("failed"));
  await waitHeading(expiry, "This permission has closed.");
  assert.equal(
    await expiry
      .getByRole("heading", { name: "Visible.", exact: true })
      .count(),
    0,
  );
  results.push(
    "known expiry clears the rendered answer locally even when revalidation is offline",
  );
  await expiry.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await browser.close();
  await app.close();
  store.close();
}
