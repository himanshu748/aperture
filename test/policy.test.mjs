import test from "node:test";
import assert from "node:assert/strict";
import { Store, Fault } from "../server/store.mjs";
function setup() {
  let time = 1800000000000;
  const s = new Store(":memory:", () => time);
  const a = s.register({
    name: "Owner",
    email: "owner@example.test",
    password: "a sufficiently long password",
  }).user;
  const b = s.register({
    name: "Second",
    email: "second@example.test",
    password: "a different long password",
  }).user;
  const camera = s.addCamera(
    a.id,
    {
      name: "My reference",
      object: "the blue chair",
      area: "the marked collection space",
      region: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 },
      consent: true,
    },
    Buffer.from("owner-private-image"),
  );
  const pass = (opts = {}) =>
    s.createPass(a.id, {
      cameraId: camera.id,
      label: "Collection",
      minutes: 30,
      budget: 5,
      cooldown: 60,
      consent: true,
      ...opts,
    });
  return {
    s,
    a,
    b,
    camera,
    pass,
    advance: (n) => {
      time += n;
    },
    now: () => time,
  };
}
const is = (status, code) => (e) =>
  e instanceof Fault && e.status === status && (!code || e.code === code);
test("authentication hashes passwords and session tokens; sessions revoke and expire", () => {
  let f = setup();
  const { s } = f;
  const login = s.login({
    email: "OWNER@example.test",
    password: "a sufficiently long password",
  });
  assert.equal(s.auth(login.token).id, f.a.id);
  assert.equal(
    s.db.prepare("SELECT token FROM sessions WHERE token=?").get(login.token),
    undefined,
  );
  assert.throws(
    () => s.login({ email: "owner@example.test", password: "wrong" }),
    is(401),
  );
  s.logout(login.token);
  assert.equal(s.auth(login.token), null);
  const next = s.login({
    email: "owner@example.test",
    password: "a sufficiently long password",
  });
  f.advance(8 * 86400000);
  assert.equal(s.auth(next.token), null);
  s.close();
});
test("private workspace and images isolate owners; input scope requires exact fields and consent", () => {
  const f = setup();
  assert.equal(f.s.workspace(f.b.id).cameras.length, 0);
  assert.throws(() => f.s.camera(f.b.id, f.camera.id), is(404));
  assert.throws(
    () =>
      f.s.createPass(f.b.id, {
        cameraId: f.camera.id,
        label: "x",
        minutes: 30,
        budget: 5,
        cooldown: 60,
        consent: true,
      }),
    is(404),
  );
  assert.throws(() => f.pass({ question: "Who is on the porch?" }), is(400));
  assert.throws(() => f.pass({ consent: false }), is(400));
  assert.throws(() => f.pass({ budget: 0 }), is(400));
  assert.throws(() => f.pass({ cooldown: 1 }), is(400));
  assert.throws(
    () =>
      f.s.addCamera(
        f.a.id,
        {
          name: "x",
          object: "x",
          area: "x",
          region: { x: 0.9, y: 0.9, width: 0.8, height: 0.8 },
          consent: true,
        },
        Buffer.from("x"),
      ),
    is(400),
  );
  f.s.close();
});
test("bearer token high entropy, stored hash only; recipient output uses a closed schema", () => {
  const f = setup(),
    p = f.pass();
  assert.match(p.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(
    f.s.db.prepare("SELECT token_hash FROM passes").get().token_hash,
    p.token,
  );
  const view = f.s.recipient(p.token);
  assert.deepEqual(Object.keys(view).sort(), [
    "cooldownUntil",
    "disclosure",
    "expires",
    "provider",
    "question",
    "remaining",
  ]);
  assert.throws(() => f.s.recipient("wrong"), is(404));
  assert.throws(() => f.s.recipient("x".repeat(43)), is(404));
  assert.throws(
    () =>
      f.s.request(p.token, {
        requestKey: "long-enough-key",
        question: "Different question",
      }),
    is(400),
  );
  f.s.close();
});
test("requests consume budget atomically, retry is idempotent, cooldown blocks additional checks", () => {
  const f = setup(),
    p = f.pass({ budget: 2 });
  const first = f.s.request(p.token, { requestKey: "first-request" });
  const retry = f.s.request(p.token, { requestKey: "first-request" });
  assert.equal(first.id, retry.id);
  assert.equal(f.s.recipient(p.token).remaining, 1);
  assert.throws(
    () => f.s.request(p.token, { requestKey: "another-request" }),
    is(429, "cooldown"),
  );
  f.s.complete(f.a.id, first.id, {
    result: "visible",
    observedAt: f.now(),
    note: "private note",
    confirmed: true,
  });
  f.advance(60001);
  f.s.request(p.token, { requestKey: "another-request" });
  assert.equal(f.s.recipient(p.token).remaining, 0);
  f.advance(60001);
  assert.throws(
    () => f.s.request(p.token, { requestKey: "third-request" }),
    is(429, "exhausted"),
  );
  f.s.close();
});
test("manual observation preserves source time and strips private metadata from result", () => {
  const f = setup(),
    p = f.pass(),
    j = f.s.request(p.token, { requestKey: "first-request" });
  const image = Buffer.from("PRIVATE IMAGE");
  f.s.complete(
    f.a.id,
    j.id,
    {
      result: "visible",
      observedAt: f.now(),
      note: "PRIVATE NOTE",
      confirmed: true,
    },
    image,
  );
  const out = f.s.result(p.token, j.id);
  assert.deepEqual(Object.keys(out).sort(), [
    "completedAt",
    "id",
    "observedAt",
    "provider",
    "result",
    "state",
  ]);
  assert.equal(out.result, "visible");
  assert.equal(out.observedAt, f.now());
  assert.equal(out.provider, "owner-observation");
  assert.ok(!JSON.stringify(out).includes("PRIVATE"));
  assert.deepEqual(Buffer.from(f.s.evidence(f.a.id, j.id)), image);
  assert.throws(() => f.s.evidence(f.b.id, j.id), is(404));
  assert.throws(
    () =>
      f.s.complete(f.a.id, j.id, {
        result: "not_visible",
        observedAt: f.now(),
        confirmed: true,
      }),
    is(409),
  );
  f.s.close();
});
test("stale observations abstain; future timestamps and unapproved result fail validation", () => {
  const f = setup(),
    p = f.pass(),
    j = f.s.request(p.token, { requestKey: "first-request" });
  assert.throws(
    () =>
      f.s.complete(f.a.id, j.id, {
        result: "person identified",
        observedAt: f.now(),
        confirmed: true,
      }),
    is(400),
  );
  assert.throws(
    () =>
      f.s.complete(f.a.id, j.id, {
        result: "visible",
        observedAt: f.now() + 10000,
        confirmed: true,
      }),
    is(400),
  );
  f.s.complete(f.a.id, j.id, {
    result: "visible",
    observedAt: f.now() - 61000,
    confirmed: true,
  });
  assert.equal(f.s.result(p.token, j.id).result, "cannot_verify");
  assert.equal(f.s.result(p.token, j.id).observedAt, f.now() - 61000);
  f.s.close();
});
test("revocation during asynchronous observation blocks release and polling", async () => {
  const f = setup(),
    p = f.pass(),
    j = f.s.request(p.token, { requestKey: "first-request" });
  let resume;
  const paused = new Promise((r) => (resume = r));
  const asynchronous = (async () => {
    await paused;
    return f.s.complete(f.a.id, j.id, {
      result: "visible",
      observedAt: f.now(),
      confirmed: true,
    });
  })();
  f.s.revoke(f.a.id, p.id);
  resume();
  await assert.rejects(asynchronous, is(409));
  assert.throws(() => f.s.result(p.token, j.id), is(410, "revoked"));
  assert.throws(
    () => f.s.request(p.token, { requestKey: "first-request" }),
    is(410, "revoked"),
  );
  assert.equal(
    f.s.db.prepare("SELECT result FROM jobs WHERE id=?").get(j.id).result,
    null,
  );
  f.s.close();
});
test("expiry during observation refuses disclosure; completed observations also become inaccessible", () => {
  const f = setup(),
    p = f.pass({ minutes: 1 }),
    j = f.s.request(p.token, { requestKey: "first-request" });
  f.advance(60001);
  assert.deepEqual(
    f.s.complete(f.a.id, j.id, {
      result: "visible",
      observedAt: f.now(),
      confirmed: true,
    }),
    { blocked: true, reason: "expired" },
  );
  assert.throws(() => f.s.result(p.token, j.id), is(410, "expired"));
  const p2 = f.pass(),
    j2 = f.s.request(p2.token, { requestKey: "next-request" });
  f.s.complete(f.a.id, j2.id, {
    result: "visible",
    observedAt: f.now(),
    confirmed: true,
  });
  f.s.revoke(f.a.id, p2.id);
  assert.throws(() => f.s.result(p2.token, j2.id), is(410, "revoked"));
  f.s.close();
});
test("pass boundary isolates check IDs; a pending timeout cannot release late result", () => {
  const f = setup(),
    p = f.pass(),
    p2 = f.pass(),
    j = f.s.request(p.token, { requestKey: "first-request" });
  assert.throws(() => f.s.result(p2.token, j.id), is(404));
  assert.throws(
    () =>
      f.s.complete(f.b.id, j.id, {
        result: "visible",
        observedAt: f.now(),
        confirmed: true,
      }),
    is(404),
  );
  f.advance(120001);
  assert.equal(f.s.result(p.token, j.id).state, "timed_out");
  assert.throws(
    () =>
      f.s.complete(f.a.id, j.id, {
        result: "visible",
        observedAt: f.now(),
        confirmed: true,
      }),
    is(410),
  );
  f.s.close();
});
test("deleting reference purges its media and observations and invalidates all its links", () => {
  const f = setup(),
    p = f.pass(),
    j = f.s.request(p.token, { requestKey: "first-request" });
  f.s.complete(
    f.a.id,
    j.id,
    { result: "visible", observedAt: f.now(), confirmed: true },
    Buffer.from("private"),
  );
  assert.throws(() => f.s.deleteCamera(f.b.id, f.camera.id), is(404));
  f.s.deleteCamera(f.a.id, f.camera.id);
  assert.equal(f.s.workspace(f.a.id).cameras.length, 0);
  assert.throws(() => f.s.recipient(p.token), is(404));
  assert.throws(() => f.s.evidence(f.a.id, j.id), is(404));
  assert.equal(f.s.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 0);
  f.s.close();
});

test("private observation record is owner-only and retains the note independently of public output", () => {
  const f = setup(),
    p = f.pass(),
    j = f.s.request(p.token, { requestKey: "private-record" });
  f.s.complete(
    f.a.id,
    j.id,
    {
      result: "cannot_verify",
      observedAt: f.now(),
      confirmed: true,
      note: "Camera obstructed by a box.",
    },
    Buffer.from("evidence"),
  );
  const record = f.s.observation(f.a.id, j.id);
  assert.equal(record.note, "Camera obstructed by a box.");
  assert.equal(record.hasImage, 1);
  assert.throws(() => f.s.observation(f.b.id, j.id), is(404));
  assert.ok(!("note" in f.s.result(p.token, j.id)));
  f.s.close();
});

test("SQLite persists accounts, references, spent budgets and revocation across a process restart", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "aperture-persistence-"));
  let s;
  try {
    s = new Store(join(dir, "app.sqlite"));
    const auth = s.register({
      name: "Persistent owner",
      email: "persistent@example.test",
      password: "a sufficiently long password",
    });
    const c = s.addCamera(
      auth.user.id,
      {
        name: "Persistence",
        object: "object",
        area: "area",
        region: { x: 0, y: 0, width: 1, height: 1 },
        consent: true,
      },
      Buffer.from("image"),
    );
    const p = s.createPass(auth.user.id, {
      cameraId: c.id,
      label: "Persistent pass",
      minutes: 30,
      budget: 2,
      cooldown: 60,
      consent: true,
    });
    s.request(p.token, { requestKey: "first-check" });
    s.revoke(auth.user.id, p.id);
    s.close();
    s = new Store(join(dir, "app.sqlite"));
    assert.equal(s.auth(auth.token).id, auth.user.id);
    assert.equal(s.workspace(auth.user.id).cameras.length, 1);
    assert.equal(s.workspace(auth.user.id).passes[0].used, 1);
    assert.throws(() => s.recipient(p.token), is(410, "revoked"));
  } finally {
    s?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
