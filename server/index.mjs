import http from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Store, Fault, strict } from "./store.mjs";
import { RingSessions } from "./ring.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BODY = 7 * 1024 * 1024;
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw new Fault(415, "Send a JSON request.");
  let chunks = [],
    size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY)
      throw new Fault(
        413,
        "Image is too large. Use a photo smaller than 5 MB.",
      );
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new Fault(400, "The request must be a valid JSON object.");
  }
}
async function photo(data, required = false) {
  if (!data) {
    if (required) throw new Fault(400, "Upload a reference photo.");
    return null;
  }
  if (
    typeof data !== "string" ||
    data.length > 7 * 1024 * 1024 ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data)
  )
    throw new Fault(400, "Use a JPEG, PNG or WebP photo smaller than 5 MB.");
  const bytes = Buffer.from(data.split(",")[1], "base64");
  if (bytes.length > 5 * 1024 * 1024)
    throw new Fault(413, "Use a photo smaller than 5 MB.");
  try {
    return await sharp(bytes, { limitInputPixels: 25000000, animated: false })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Fault(
      400,
      "This photo could not be decoded. Use a valid JPEG, PNG or WebP under 25 megapixels.",
    );
  }
}
function cookies(req) {
  const all = req.headers.cookie || "";
  return all
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("aperture_session="))
    ?.slice(17);
}
export async function createApp({
  store,
  origin = "http://localhost:4332",
  dev = false,
  ring = new RingSessions({ mediaHosts: (process.env.RING_MEDIA_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean) }),
} = {}) {
  let owned = false;
  if (!store) {
    await mkdir(resolve(root, "data"), { recursive: true, mode: 0o700 });
    store = new Store(
      process.env.DATABASE_PATH || resolve(root, "data/aperture.sqlite"),
    );
    owned = true;
  }
  const secure = new URL(origin).protocol === "https:";
  let vite = dev
    ? await (
        await import("vite")
      ).createServer({
        root,
        server: { middlewareMode: true },
        appType: "custom",
      })
    : null;
  const rates = new Map();
  function limit(req, lane, max) {
    const key = `${req.socket.remoteAddress}:${lane}`,
      now = Date.now(),
      r = rates.get(key);
    if (!r || r.until < now) {
      if (rates.size > 5000) rates.clear();
      rates.set(key, { count: 1, until: now + 60000 });
      return;
    }
    if (++r.count > max)
      throw new Fault(429, "Too many requests. Wait one minute and try again.");
  }
  const server = http.createServer(async (req, res) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": `default-src 'self'; img-src 'self' blob: data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'${dev ? " 'unsafe-inline'" : ""}; connect-src 'self'${dev ? " ws://localhost:4332 ws://127.0.0.1:4332" : ""}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    };
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const send = (status, data, extra = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...extra });
      res.end(JSON.stringify(data));
    };
    const setSession = (token) =>
      `aperture_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? "; Secure" : ""}`;
    try {
      const path = new URL(req.url, "http://localhost").pathname,
        method = req.method;
      limit(req, "all", 180);
      if (path.startsWith("/api/")) {
        if (
          ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
          req.headers.origin !== origin
        )
          throw new Fault(
            403,
            "This request came from another site. Reload Aperture and try again.",
          );
        if (path === "/api/health" && method === "GET")
          return send(200, {
            status: "ok",
            providers: {
              ring: "adapter-available",
              vision: "disconnected",
              manual: "available",
            },
          });
        if (
          ["/api/register", "/api/login"].includes(path) &&
          method === "POST"
        ) {
          limit(req, "auth", 8);
          let b = await body(req);
          const out = path.endsWith("register")
            ? store.register(b)
            : store.login(b);
          return send(
            200,
            { user: out.user },
            { "Set-Cookie": setSession(out.token) },
          );
        }
        if (path === "/api/logout" && method === "POST") {
          const owner = store.auth(cookies(req));
          if (owner) ring.disconnect(owner.id);
          store.logout(cookies(req));
          return send(
            200,
            { ok: true },
            {
              "Set-Cookie": `aperture_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`,
            },
          );
        }
        let m = path.match(
          /^\/api\/p\/([A-Za-z0-9_-]+)(?:\/(checks)(?:\/([A-Za-z0-9-]+))?)?$/,
        );
        if (m) {
          limit(req, "recipient", 90);
          if (method === "GET" && !m[2])
            return send(200, store.recipient(m[1]));
          if (method === "POST" && m[2] && !m[3])
            return send(201, store.request(m[1], await body(req)));
          if (method === "GET" && m[3])
            return send(200, store.result(m[1], m[3]));
          throw new Fault(405, "Method not allowed.");
        }
        const user = store.auth(cookies(req));
        if (!user)
          throw new Fault(
            401,
            "Sign in to your private workspace.",
            "signed_out",
          );
        if (path === "/api/me" && method === "GET") return send(200, { user });
        if (path === "/api/ring" && method === "GET") return send(200, ring.status(user.id));
        if (path === "/api/ring" && method === "DELETE") { ring.disconnect(user.id); return send(200, ring.status(user.id)); }
        if (path === "/api/ring/connect" && method === "POST") {
          limit(req, "ring-connect", 6);
          const b = await body(req); strict(b, ["token", "consent"]);
          return send(200, await ring.connect(user.id, b.token, b.consent));
        }
        if (path === "/api/ring/reference" && method === "POST") {
          limit(req, "ring-image", 12);
          const b = await body(req); strict(b, ["deviceId", "componentId"]);
          return send(201, await ring.snapshot(user.id, b));
        }
        if (path === "/api/ring/live" && method === "POST") {
          limit(req, "ring-live", 6);
          const b = await body(req); strict(b, ["deviceId", "componentId", "sdp"]);
          return send(201, await ring.startLive(user.id, b));
        }
        if ((m = path.match(/^\/api\/ring\/live\/([a-f0-9-]+)$/)) && method === "DELETE") {
          await ring.stopLive(user.id, m[1]); return send(200, { stopped: true });
        }
        if ((m = path.match(/^\/api\/ring\/live\/([a-f0-9-]+)\/frame$/)) && method === "POST") {
          limit(req, "ring-capture", 12);
          const b = await body(req); strict(b, ["image"]);
          const live = ring.live(user.id, m[1]);
          if (live.jobId) store.pendingJob(user.id, live.jobId);
          const image = await photo(b.image, true);
          // Decoding can outlive the stream, connection, or permission.
          if (live.jobId) store.pendingJob(user.id, live.jobId);
          return send(201, ring.captureLive(user.id, m[1], image));
        }
        if ((m = path.match(/^\/api\/ring\/frames\/([a-f0-9-]+)$/)) && method === "DELETE") {
          ring.discardFrame(user.id, m[1]);
          return send(200, { discarded: true });
        }
        if ((m = path.match(/^\/api\/ring\/frames\/([a-f0-9-]+)$/)) && method === "GET") {
          const frame = ring.frame(user.id, m[1]);
          if (frame.jobId) store.pendingJob(user.id, frame.jobId);
          res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(frame.image);
        }
        if (path === "/api/cameras/ring" && method === "POST") {
          const b = await body(req); strict(b, ["frameId", "name", "object", "area", "region", "consent"]);
          const frame = ring.frame(user.id, b.frameId, null), { frameId, ...details } = b;
          const result = store.addRingCamera(user.id, details, frame);
          ring.discardFrame(user.id, frameId);
          return send(201, result);
        }
        if ((m = path.match(/^\/api\/checks\/([a-f0-9-]+)\/ring-live$/)) && method === "POST") {
          limit(req, "ring-live", 6);
          const b = await body(req); strict(b, ["sdp"]);
          const job = store.pendingJob(user.id, m[1]), source = store.ringSource(user.id, job.camera_id);
          if (!source) throw new Fault(400, "This reference has no Ring source. Create a reference from Ring first.");
          const stream = await ring.startLive(user.id, { ...source, sdp: b.sdp, jobId: job.id, passId: job.pass_id, cameraId: job.camera_id, expiresAt: Math.min(job.passExpires, job.created + 120000) });
          try { store.pendingJob(user.id, job.id); }
          catch (error) { await ring.stopLive(user.id, stream.id); throw error; }
          return send(201, stream);
        }
        if ((m = path.match(/^\/api\/checks\/([a-f0-9-]+)\/ring-snapshot$/)) && method === "POST") {
          limit(req, "ring-image", 12); strict(await body(req), []);
          const job = store.pendingJob(user.id, m[1]), source = store.ringSource(user.id, job.camera_id);
          if (!source) throw new Fault(400, "This reference has no Ring source. Create a reference from Ring first.");
          const frame = await ring.snapshot(user.id, { ...source, jobId: job.id, passId: job.pass_id, cameraId: job.camera_id });
          // A download may outlive the permission that requested it.
          try { store.pendingJob(user.id, job.id); }
          catch (error) { ring.discardFrame(user.id, frame.id); throw error; }
          return send(201, frame);
        }
        if (path === "/api/workspace" && method === "GET")
          return send(200, store.workspace(user.id));
        if (path === "/api/export" && method === "GET")
          return send(
            200,
            { exportedAt: Date.now(), ...store.workspace(user.id) },
            {
              "Content-Disposition":
                'attachment; filename="aperture-receipts.json"',
            },
          );
        if (path === "/api/cameras" && method === "POST") {
          let b = await body(req);
          const image = await photo(b.image, true);
          return send(201, store.addCamera(user.id, b, image));
        }
        if ((m = path.match(/^\/api\/cameras\/([a-f0-9-]+)(\/image)?$/))) {
          if (method === "GET" && m[2]) {
            const c = store.camera(user.id, m[1]);
            res.writeHead(200, { "Content-Type": "image/jpeg" });
            return res.end(c.image);
          }
          if (method === "DELETE" && !m[2]) {
            const result = store.deleteCamera(user.id, m[1]);
            ring.stopScope(user.id, "cameraId", m[1]);
            return send(200, result);
          }
        }
        if (path === "/api/passes" && method === "POST")
          return send(201, store.createPass(user.id, await body(req)));
        if (
          (m = path.match(/^\/api\/passes\/([a-f0-9-]+)\/revoke$/)) &&
          method === "POST"
        ) {
          const result = store.revoke(user.id, m[1]);
          ring.stopScope(user.id, "passId", m[1]);
          return send(200, result);
        }
        if (
          (m = path.match(/^\/api\/checks\/([a-f0-9-]+)$/)) &&
          method === "GET"
        )
          return send(200, store.observation(user.id, m[1]));
        if (
          (m = path.match(/^\/api\/checks\/([a-f0-9-]+)\/complete$/)) &&
          method === "POST"
        ) {
          const b = await body(req);
          if (Object.hasOwn(b, "frameId")) {
            strict(b, ["frameId", "result", "note", "confirmed"]);
            const frame = ring.frame(user.id, b.frameId, m[1]);
            const { frameId, ...details } = b;
            const result = store.complete(user.id, m[1], details, frame.image, frame);
            ring.stopScope(user.id, "jobId", m[1]);
            return send(200, result);
          }
          const image = await photo(b.image);
          const result = store.complete(user.id, m[1], b, image);
          ring.stopScope(user.id, "jobId", m[1]);
          return send(200, result);
        }
        if (
          (m = path.match(/^\/api\/checks\/([a-f0-9-]+)\/image$/)) &&
          method === "GET"
        ) {
          const img = store.evidence(user.id, m[1]);
          res.writeHead(200, { "Content-Type": "image/jpeg" });
          return res.end(img);
        }
        throw new Fault(404, "Not found.");
      }
      if (method !== "GET" && method !== "HEAD")
        throw new Fault(405, "Method not allowed.");
      if (vite) {
        return vite.middlewares(req, res, async () => {
          try {
            const html = await vite.transformIndexHtml(
              req.url,
              await readFile(resolve(root, "index.html"), "utf8"),
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch (e) {
            vite.ssrFixStacktrace(e);
            send(500, { error: "Unable to render page." });
          }
        });
      }
      const dist = resolve(root, "dist");
      let filename = resolve(dist, "." + decodeURIComponent(path));
      if (!filename.startsWith(dist + "/"))
        filename = resolve(dist, "index.html");
      let s = await stat(filename).catch(() => null);
      if (!s || !s.isFile()) filename = resolve(dist, "index.html");
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".ttf": "font/ttf",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      res.setHeader(
        "Content-Type",
        mime[extname(filename)] || "application/octet-stream",
      );
      if (filename.includes("/assets/") || filename.includes("/fonts/"))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.end(method === "HEAD" ? undefined : await readFile(filename));
    } catch (e) {
      if (!res.headersSent)
        send(e instanceof Fault ? e.status : 500, {
          error:
            e instanceof Fault
              ? e.message
              : "Something went wrong. Please try again.",
          code: e instanceof Fault ? e.code : "internal_error",
        });
      else res.end();
      if (!(e instanceof Fault)) console.error("Request failed:", e.message);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return {
    server,
    store,
    close: async () => {
      await new Promise((r) => server.close(r));
      if (vite) await vite.close();
      ring.close();
      if (owned) store.close();
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4332),
    host = process.env.HOST || "127.0.0.1",
    origin = process.env.PUBLIC_URL || `http://localhost:${port}`;
  if (process.env.NODE_ENV === "production" && !process.env.PUBLIC_URL)
    throw new Error(
      "Set PUBLIC_URL to the external HTTPS origin in production.",
    );
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))
    throw new Error("Production PUBLIC_URL must use HTTPS.");
  const app = await createApp({ origin, dev: process.argv.includes("--dev") });
  app.server.listen(port, host, () =>
    console.log(`Aperture listening at ${origin}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
