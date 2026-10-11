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
  let dropped = false, recoveryThrottled = false;
  await lost.route(`**/api/p/${p2.token}/checks`, async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else if (route.request().method() === "POST" && !recoveryThrottled) {
      recoveryThrottled = true;
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Too many requests. Wait one minute and try again.", code: "invalid_request" }) });
    } else await route.continue();
  });
  await lost.goto(`${base}/p/${p2.token}`);
  await lost
    .getByRole("button", { name: "Request a check", exact: true })
    .click();
  await lost.getByRole("alert").filter({ hasText: "Too many requests" }).waitFor();
  assert.ok(await lost.evaluate(token => JSON.parse(sessionStorage.getItem(`aperture-check:${token}`))?.requestKey, p2.token), "generic throttling must retain an ambiguous accepted request key");
  await waitHeading(lost, "Waiting for the owner’s view.");
  assert.equal(remaining(p2), 0);
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS n FROM jobs WHERE pass_id=?")
      .get(p2.id).n,
    1,
  );
  results.push(
    "lost accepted POST response survives generic recovery throttling and recovers idempotently",
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
  // Another holder can spend a check after this tab's access read. A rejected
  // POST must not become an automatic future check once their cooldown ends.
  const makeRacePass = () => store.createPass(user.id, {
    cameraId: camera.id, label: "Rejection race", minutes: 30,
    budget: 3, cooldown: 60, consent: true,
  });
  const rejected = makeRacePass();
  const race = await context.newPage();
  let rejectedPosts = 0;
  await race.goto(`${base}/p/${rejected.token}`);
  await race.getByRole("button", { name: "Request a check", exact: true }).waitFor();
  const otherJob = store.request(rejected.token, { requestKey: "another-holder-request" });
  store.complete(user.id, otherJob.id, { result: "cannot_verify", observedAt: Date.now(), confirmed: true });
  race.on("request", req => {
    if (req.method() === "POST" && req.url().endsWith(`/api/p/${rejected.token}/checks`)) rejectedPosts++;
  });
  await race.getByRole("button", { name: "Request a check", exact: true }).click();
  await race.waitForFunction(token => sessionStorage.getItem(`aperture-check:${token}`) === null, rejected.token, { timeout: 10000 });
  assert.equal(rejectedPosts, 1);
  store.db.prepare("UPDATE passes SET last_check=? WHERE id=?").run(Date.now() - 61000, rejected.id);
  await race.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("Request a check") && !button.disabled), null, { timeout: 15000 });
  assert.equal(rejectedPosts, 1, "a rejected check must not dispatch automatically after cooldown");
  assert.equal(remaining(rejected), 2);
  await race.getByRole("button", { name: "Request a check", exact: true }).click();
  await waitHeading(race, "Waiting for the owner’s view.");
  assert.equal(remaining(rejected), 1);
  results.push("cooldown race discards rejected key; future checks require another explicit click");
  await race.close();

  const recoveredRejection = makeRacePass();
  store.request(recoveredRejection.token, { requestKey: "other-holder-recovery" });
  const recovering = await context.newPage();
  await recovering.addInitScript(({ token }) => {
    sessionStorage.setItem(`aperture-check:${token}`, JSON.stringify({ requestKey: "rejected-before-reload" }));
  }, { token: recoveredRejection.token });
  let recoveryPosts = 0;
  recovering.on("request", req => {
    if (req.method() === "POST" && req.url().endsWith(`/api/p/${recoveredRejection.token}/checks`)) recoveryPosts++;
  });
  await recovering.goto(`${base}/p/${recoveredRejection.token}`);
  await recovering.getByRole("alert").filter({ hasText: "Wait for the cooldown" }).waitFor();
  await recovering.getByRole("button", { name: /^Next check in/ }).waitFor({ timeout: 1500 });
  assert.equal(await recovering.getByRole("heading", { name: "Connection interrupted.", exact: true }).count(), 0);
  assert.equal(await recovering.getByText("We cannot confirm access right now. Your saved check will be recovered after a successful connection.", { exact: true }).count(), 0);
  assert.equal(await recovering.evaluate(token => sessionStorage.getItem(`aperture-check:${token}`), recoveredRejection.token), null);
  store.db.prepare("UPDATE passes SET last_check=? WHERE id=?").run(Date.now() - 61000, recoveredRejection.id);
  await recovering.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("Request a check") && !button.disabled), null, { timeout: 15000 });
  assert.equal(recoveryPosts, 1);
  assert.equal(remaining(recoveredRejection), 2);
  results.push("reloading an unaccepted key clears it after a definitive rejection instead of queueing a check");
  await recovering.close();
  // A fresh request rejected by a generic throttle is unaccepted, not recoverable.
  const freshPass = makeRacePass();
  const fresh = await context.newPage();
  let freshPosts = 0;
  fresh.on("request", req => {
    if (req.method() === "POST" && req.url().endsWith(`/api/p/${freshPass.token}/checks`)) freshPosts++;
  });
  await fresh.route(`**/api/p/${freshPass.token}/checks`, route => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Generic throttle for fresh request", code: "invalid_request" }) }));
  await fresh.goto(`${base}/p/${freshPass.token}`);
  await fresh.getByRole("button", { name: "Request a check", exact: true }).click();
  await fresh.waitForFunction(token => sessionStorage.getItem(`aperture-check:${token}`) === null, freshPass.token);
  await fresh.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("Request a check") && !button.disabled));
  assert.equal(freshPosts, 1);
  assert.equal(remaining(freshPass), 3);
  await fresh.unroute(`**/api/p/${freshPass.token}/checks`);
  await fresh.getByRole("button", { name: "Request a check", exact: true }).click();
  await waitHeading(fresh, "Waiting for the owner’s view.");
  assert.equal(freshPosts, 2);
  assert.equal(remaining(freshPass), 2);
  results.push("fresh generic throttle discards unaccepted key; only explicit retry creates one job");
  await fresh.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await browser.close();
  await app.close();
  store.close();
}
