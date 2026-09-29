import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export class Fault extends Error {
  constructor(status, message, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const sourceProvider = (source) => source?.mediaOrigin === "browser-live-capture" ? "ring-live-owner-review" : "ring-snapshot-owner-review";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const id = () => randomUUID();
const fail = (status, msg, code) => {
  throw new Fault(status, msg, code);
};
export function text(v, name, min = 1, max = 200) {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
    fail(400, `${name} must be ${min}–${max} characters.`);
  return v.trim();
}
export function integer(v, name, min, max) {
  if (!Number.isInteger(v) || v < min || v > max)
    fail(400, `${name} must be between ${min} and ${max}.`);
  return v;
}
export function strict(o, keys) {
  if (
    !o ||
    Array.isArray(o) ||
    typeof o !== "object" ||
    Object.keys(o).some((k) => !keys.includes(k))
  )
    fail(400, "Unexpected request fields.");
}
export class Store {
  constructor(path = ":memory:", now = () => Date.now()) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS cameras(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),name TEXT NOT NULL,object TEXT NOT NULL,area TEXT NOT NULL,region TEXT NOT NULL,image BLOB NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS passes(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),camera_id TEXT REFERENCES cameras(id),token_hash TEXT UNIQUE NOT NULL,label TEXT NOT NULL,question TEXT NOT NULL,expires INTEGER NOT NULL,budget INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,cooldown INTEGER NOT NULL,last_check INTEGER,revoked INTEGER,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,pass_id TEXT REFERENCES passes(id),request_key TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,completed INTEGER,result TEXT,observed INTEGER,note TEXT,image BLOB,UNIQUE(pass_id,request_key));
 CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),pass_id TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS pass_owner ON passes(user_id);CREATE INDEX IF NOT EXISTS job_pass ON jobs(pass_id);
 CREATE TABLE IF NOT EXISTS ring_sources(camera_id TEXT PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,metadata TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS job_sources(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,metadata TEXT NOT NULL);`);
  }
  tx(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let x = fn();
      this.db.exec("COMMIT");
      return x;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  receipt(user, pass, action, detail) {
    this.db
      .prepare("INSERT INTO receipts VALUES(?,?,?,?,?,?)")
      .run(id(), user, pass, action, JSON.stringify(detail), this.now());
  }
  register(body) {
    strict(body, ["email", "password", "name"]);
    const email = text(body.email, "Email", 5, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "Enter a valid email address.");
    const password = text(body.password, "Password", 12, 128),
      name = text(body.name, "Name", 1, 80);
    const salt = randomBytes(16).toString("hex");
    const encoded = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    let user = { id: id(), email, name };
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(user.id, email, name, encoded, this.now());
    } catch (e) {
      if (String(e).includes("UNIQUE"))
        fail(409, "Unable to create this account. Try signing in.");
      throw e;
    }
    return this.session(user);
  }
  login(body) {
    strict(body, ["email", "password"]);
    const email = text(body.email, "Email", 5, 254).toLowerCase(),
      password = text(body.password, "Password", 1, 128);
    let u = this.db.prepare("SELECT * FROM users WHERE email=?").get(email);
    let [salt, expected] = (
      u?.password || `${"0".repeat(32)}:${"0".repeat(128)}`
    ).split(":");
    const actual = scryptSync(password, salt, 64);
    if (!u || !timingSafeEqual(actual, Buffer.from(expected, "hex")))
      fail(401, "Email or password is incorrect.");
    return this.session({ id: u.id, name: u.name, email: u.email });
  }
  session(user) {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(this.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hash(token), user.id, this.now() + 7 * 86400000);
    return { user, token };
  }
  auth(token) {
    if (typeof token !== "string" || token.length > 100) return null;
    return (
      this.db
        .prepare(
          "SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        )
        .get(hash(token), this.now()) || null
    );
  }
  logout(token) {
    if (token)
      this.db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  }
  camera(user, cameraId) {
    return (
      this.db
        .prepare("SELECT * FROM cameras WHERE id=? AND user_id=?")
        .get(cameraId, user) || fail(404, "Reference not found.")
    );
  }
  addCamera(user, b, image) {
    strict(b, ["name", "object", "area", "region", "consent", "image"]);
    const name = text(b.name, "Reference name", 1, 80),
      object = text(b.object, "Object", 1, 100),
      area = text(b.area, "Approved area", 1, 140);
    if (b.consent !== true) fail(400, "Confirm your right to use this image.");
    strict(b.region, ["x", "y", "width", "height"]);
    const r = b.region;
    for (const k of ["x", "y", "width", "height"])
      if (
        typeof r[k] !== "number" ||
        !Number.isFinite(r[k]) ||
        r[k] < 0 ||
        r[k] > 1
      )
        fail(400, "Mark a valid area on the image.");
    if (
      r.width < 0.05 ||
      r.height < 0.05 ||
      r.x + r.width > 1.00001 ||
      r.y + r.height > 1.00001
    )
      fail(400, "The marked area must fit inside the image.");
    if (!Buffer.isBuffer(image) || !image.length)
      fail(400, "Upload a reference photo.");
    const cid = id();
    this.db
      .prepare("INSERT INTO cameras VALUES(?,?,?,?,?,?,?,?)")
      .run(cid, user, name, object, area, JSON.stringify(r), image, this.now());
    this.receipt(user, null, "reference_created", {
      reference: cid,
      consent: true,
    });
    return { id: cid };
  }
  addRingCamera(user, b, frame) {
    return this.tx(() => {
      const result = this.addCamera(user, b, frame.image);
      const metadata = { provider: frame.mediaOrigin === "browser-live-capture" ? "ring-live-browser-capture" : "ring-api", deviceId: frame.deviceId, componentId: frame.componentId, capturedAt: frame.capturedAt, downloadedAt: frame.downloadedAt, mediaOrigin: frame.mediaOrigin, requestId: frame.requestId, sourceTimeVerified: frame.sourceTimeVerified };
      this.db.prepare("INSERT INTO ring_sources VALUES(?,?)").run(result.id, JSON.stringify(metadata));
      this.receipt(user, null, "ring_reference_recorded", { reference: result.id, ...metadata });
      return result;
    });
  }
  ringSource(user, cameraId) {
    this.camera(user, cameraId);
    const row = this.db.prepare("SELECT metadata FROM ring_sources WHERE camera_id=?").get(cameraId);
    return row ? JSON.parse(row.metadata) : null;
  }
  pendingJob(user, job) {
    const row = this.db.prepare("SELECT j.*,p.camera_id,p.user_id,p.expires AS passExpires FROM jobs j JOIN passes p ON p.id=j.pass_id WHERE j.id=? AND p.user_id=?").get(job, user) || fail(404, "Check not found.");
    this.active(this.db.prepare("SELECT * FROM passes WHERE id=?").get(row.pass_id));
    if (row.state !== "pending" || this.now() - row.created >= 120000) fail(409, "This check is no longer waiting for an observation.");
    return row;
  }
  createPass(user, b) {
    strict(b, [
      "cameraId",
      "label",
      "minutes",
      "budget",
      "cooldown",
      "consent",
    ]);
    let c = this.camera(user, text(b.cameraId, "Reference ID", 1, 60));
    const label = text(b.label, "Pass label", 1, 100),
      minutes = integer(b.minutes, "Duration", 1, 1440),
      budget = integer(b.budget, "Checks", 1, 20),
      cooldown = integer(b.cooldown, "Cooldown", 60, 3600);
    if (b.consent !== true)
      fail(400, "Approve the exact question before sharing.");
    const token = randomBytes(32).toString("base64url"),
      pid = id(),
      now = this.now(),
      question = `Is ${c.object} visible in ${c.area}?`;
    this.tx(() => {
      this.db
        .prepare(
          "INSERT INTO passes(id,user_id,camera_id,token_hash,label,question,expires,budget,cooldown,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          pid,
          user,
          c.id,
          hash(token),
          label,
          question,
          now + minutes * 60000,
          budget,
          cooldown * 1000,
          now,
        );
      this.receipt(user, pid, "pass_created", {
        question,
        minutes,
        budget,
        cooldown,
      });
    });
    return { id: pid, token, expires: now + minutes * 60000, question };
  }
  findPass(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      fail(404, "This pass is unavailable.", "unavailable");
    return (
      this.db
        .prepare("SELECT * FROM passes WHERE token_hash=?")
        .get(hash(token)) ||
      fail(404, "This pass is unavailable.", "unavailable")
    );
  }
  active(pass) {
    if (pass.revoked) fail(410, "The owner revoked this pass.", "revoked");
    if (pass.expires <= this.now())
      fail(410, "This pass has expired.", "expired");
  }
  recipient(token) {
    const p = this.findPass(token);
    this.active(p);
    return {
      question: p.question,
      expires: p.expires,
      remaining: p.budget - p.used,
      cooldownUntil: p.last_check
        ? Math.min(p.last_check + p.cooldown, p.expires)
        : 0,
      provider: this.ringSource(p.user_id, p.camera_id) ? sourceProvider(this.ringSource(p.user_id, p.camera_id)) : "owner-observation",
      disclosure:
        "Anyone with this link can request the approved observation. No images are shared.",
    };
  }
  request(token, b) {
    strict(b, ["requestKey"]);
    const key = text(b.requestKey, "Request key", 8, 100);
    return this.tx(() => {
      const p = this.findPass(token);
      this.active(p);
      let old = this.db
        .prepare("SELECT * FROM jobs WHERE pass_id=? AND request_key=?")
        .get(p.id, key);
      if (old) return this.publicJob(p, old);
      if (p.used >= p.budget)
        fail(429, "This pass has no checks remaining.", "exhausted");
      if (p.last_check !== null && p.last_check + p.cooldown > this.now())
        fail(
          429,
          "Wait for the cooldown before requesting another check.",
          "cooldown",
        );
      let pending = this.db
        .prepare(
          "SELECT id FROM jobs WHERE pass_id=? AND state='pending' AND created>?",
        )
        .get(p.id, this.now() - 120000);
      if (pending)
        fail(409, "A check is already waiting for the owner.", "pending");
      const job = { id: id(), state: "pending", created: this.now() };
      this.db
        .prepare(
          "INSERT INTO jobs(id,pass_id,request_key,created) VALUES(?,?,?,?)",
        )
        .run(job.id, p.id, key, job.created);
      this.db
        .prepare("UPDATE passes SET used=used+1,last_check=? WHERE id=?")
        .run(this.now(), p.id);
      this.receipt(p.user_id, p.id, "check_requested", {
        job: job.id,
        provider: "owner-observation",
      });
      return this.publicJob(p, job);
    });
  }
  publicJob(p, j) {
    this.active(p);
    if (j.state === "blocked")
      fail(410, "This observation is no longer available.", "unavailable");
    if (j.state === "pending")
      return {
        id: j.id,
        state: this.now() - j.created >= 120000 ? "timed_out" : "pending",
        requestedAt: j.created,
      };
    const source = this.db.prepare("SELECT metadata FROM job_sources WHERE job_id=?").get(j.id);
    const provenance = source ? JSON.parse(source.metadata) : null;
    return {
      id: j.id,
      state: "complete",
      result: j.result,
      observedAt: j.observed,
      completedAt: j.completed,
      provider: provenance ? sourceProvider(provenance) : "owner-observation",
      ...(provenance?.mediaOrigin === "browser-live-capture" ? { reviewedAt: provenance.reviewedAt, sourceTimeVerified: false } : {}),
    };
  }
  result(token, job) {
    let p = this.findPass(token);
    this.active(p);
    let j =
      this.db
        .prepare("SELECT * FROM jobs WHERE id=? AND pass_id=?")
        .get(job, p.id) || fail(404, "Check not found.");
    return this.publicJob(p, j);
  }
  complete(user, job, b, image = null, source = null) {
    strict(b, ["result", "observedAt", "note", "image", "confirmed"]);
    if (!["visible", "not_visible", "cannot_verify"].includes(b.result))
      fail(400, "Choose one of the approved outcomes.");
    if (b.confirmed !== true)
      fail(400, "Confirm you observed the approved area.");
    if (!source && (
      !Number.isSafeInteger(b.observedAt) ||
      b.observedAt > this.now() + 5000 ||
      b.observedAt < this.now() - 86400000
    ))
      fail(400, "Enter a valid observation time within the last day.");
    if (b.note !== undefined && typeof b.note !== "string")
      fail(400, "Private note must be text.");
    const note =
      typeof b.note === "string"
        ? text(b.note || "No additional note", "Private note", 1, 1000)
        : "";
    return this.tx(() => {
      let j =
        this.db
          .prepare(
            "SELECT j.*,p.user_id FROM jobs j JOIN passes p ON p.id=j.pass_id WHERE j.id=? AND p.user_id=?",
          )
          .get(job, user) || fail(404, "Check not found.");
      let p = this.db.prepare("SELECT * FROM passes WHERE id=?").get(j.pass_id);
      if (j.state !== "pending")
        fail(409, "This check has already been resolved.");
      try {
        this.active(p);
      } catch (e) {
        this.db
          .prepare("UPDATE jobs SET state='blocked',completed=? WHERE id=?")
          .run(this.now(), j.id);
        this.receipt(user, p.id, "release_blocked", {
          job: j.id,
          reason: e.code,
        });
        return { blocked: true, reason: e.code };
      }
      if (this.now() - j.created >= 120000)
        fail(
          410,
          "This check timed out. Ask the recipient to request another check.",
        );
      const observedAt = source ? source.capturedAt : b.observedAt;
      const fresh = Number.isSafeInteger(observedAt) && (!source || source.sourceTimeVerified) &&
        this.now() - observedAt <= 60000 && observedAt >= j.created - 60000 && observedAt <= this.now() + 5000;
      const result = fresh ? b.result : "cannot_verify";
      this.db
        .prepare(
          "UPDATE jobs SET state='complete',completed=?,result=?,observed=?,note=?,image=? WHERE id=?",
        )
        .run(this.now(), result, observedAt, note, image, j.id);
      if (source) this.db.prepare("INSERT INTO job_sources VALUES(?,?)").run(j.id, JSON.stringify({ provider: source.mediaOrigin === "browser-live-capture" ? "ring-live-browser-capture" : "ring-api", reviewedAt: this.now(), capturedAt: source.capturedAt, downloadedAt: source.downloadedAt, mediaOrigin: source.mediaOrigin, requestId: source.requestId, sourceTimeVerified: source.sourceTimeVerified, deviceId: source.deviceId, componentId: source.componentId }));
      this.receipt(user, p.id, "observation_recorded", {
        job: j.id,
        result,
        observedAt,
        fresh,
        provider: source ? sourceProvider(source) : "owner-observation",
      });
      return { result, fresh };
    });
  }
  revoke(user, pid) {
    return this.tx(() => {
      let p =
        this.db
          .prepare("SELECT * FROM passes WHERE id=? AND user_id=?")
          .get(pid, user) || fail(404, "Pass not found.");
      if (!p.revoked) {
        this.db
          .prepare("UPDATE passes SET revoked=? WHERE id=?")
          .run(this.now(), pid);
        this.db
          .prepare(
            "UPDATE jobs SET state='blocked',result=NULL,observed=NULL WHERE pass_id=? AND state='pending'",
          )
          .run(pid);
        this.receipt(user, pid, "pass_revoked", {});
      }
      return { revoked: true };
    });
  }
  deleteCamera(user, cid) {
    this.camera(user, cid);
    this.tx(() => {
      const passes = this.db
        .prepare("SELECT id FROM passes WHERE camera_id=? AND user_id=?")
        .all(cid, user);
      for (const p of passes) {
        this.db.prepare("DELETE FROM jobs WHERE pass_id=?").run(p.id);
        this.db.prepare("DELETE FROM passes WHERE id=?").run(p.id);
      }
      this.db
        .prepare("DELETE FROM cameras WHERE id=? AND user_id=?")
        .run(cid, user);
      this.receipt(user, null, "reference_deleted", {
        reference: cid,
        passesRevoked: passes.length,
      });
    });
    return { deleted: true };
  }
  workspace(user) {
    const now = this.now();
    return {
      cameras: this.db
        .prepare(
          "SELECT id,name,object,area,region,created FROM cameras WHERE user_id=? ORDER BY created DESC",
        )
        .all(user)
        .map((c) => ({ ...c, region: JSON.parse(c.region), ringSource: this.ringSource(user, c.id) })),
      passes: this.db
        .prepare(
          "SELECT id,camera_id,label,question,expires,budget,used,cooldown,last_check,revoked,created FROM passes WHERE user_id=? ORDER BY created DESC",
        )
        .all(user)
        .map((p) => ({
          ...p,
          status: p.revoked
            ? "revoked"
            : p.expires <= now
              ? "expired"
              : p.used >= p.budget
                ? "exhausted"
                : "active",
        })),
      pending: this.db
        .prepare(
          "SELECT j.id,j.created,p.id as passId,p.label,p.question,p.camera_id FROM jobs j JOIN passes p ON p.id=j.pass_id WHERE p.user_id=? AND j.state='pending' AND p.revoked IS NULL AND p.expires>? AND j.created>? ORDER BY j.created",
        )
        .all(user, now, now - 120000),
      receipts: this.db
        .prepare(
          "SELECT id,pass_id,action,detail,created FROM receipts WHERE user_id=? ORDER BY created DESC LIMIT 100",
        )
        .all(user)
        .map((r) => ({ ...r, detail: JSON.parse(r.detail) })),
      provider: { ringAdapter: "available", automatedRecognition: false, answerApproval: "owner" },
    };
  }
  observation(user, job) {
    const record = (
      this.db
        .prepare(
          "SELECT j.id,j.state,j.result,j.observed,j.completed,j.note,(j.image IS NOT NULL) as hasImage,p.question FROM jobs j JOIN passes p ON p.id=j.pass_id WHERE j.id=? AND p.user_id=?",
        )
        .get(job, user) || fail(404, "Observation not found.")
    );
    const source = this.db.prepare("SELECT metadata FROM job_sources WHERE job_id=?").get(job);
    return { ...record, source: source ? JSON.parse(source.metadata) : null };
  }
  evidence(user, job) {
    let r = this.db
      .prepare(
        "SELECT j.image FROM jobs j JOIN passes p ON p.id=j.pass_id WHERE j.id=? AND p.user_id=?",
      )
      .get(job, user);
    return r?.image || fail(404, "Evidence image not found.");
  }
  close() {
    this.db.close();
  }
}
