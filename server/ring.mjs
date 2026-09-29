import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Fault, text } from "./store.mjs";

const API = "https://api.amazonvision.com";
const SESSION_MS = 30 * 60_000;
const FRAME_MS = 5 * 60_000;
const fail = (status, message, code) => { throw new Fault(status, message, code); };
const badResponse = () => fail(502, "Ring returned an unexpected response. No observation was released.", "ring_response");
async function bounded(response, max) {
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    return fail(502, "The Ring response is too large to use.", "ring_size");
  }
  const reader = response.body?.getReader();
  if (!reader) return badResponse();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); return fail(502, "The Ring response is too large to use.", "ring_size"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
function upstreamStatus(status) {
  const messages = {
    401: [401, "The Ring token expired or was rejected. Generate a new Playground token and reconnect.", "ring_token"],
    403: [403, "Ring did not authorize this device or operation. Check the devices shared with your token.", "ring_permission"],
    404: [404, "Ring could not find this device. Reconnect to refresh the available devices.", "ring_device"],
    416: [422, "Ring has no recorded image in this time window. Start an authorized live view or official simulated event, then try again.", "ring_no_media"],
    425: [422, "Ring is still preparing this recording. Wait a moment, then fetch again.", "ring_not_ready"],
    429: [429, "Ring is limiting requests. Wait before trying again.", "ring_rate"],
  };
  const info = messages[status] || [502, "Ring could not complete this request. No observation was released.", "ring_unavailable"];
  return fail(...info);
}
/** Official Partner API HTTP client. A test transport may emulate its contract; it is never an official simulator. */
export class RingSessions {
  constructor({ fetcher = fetch, now = () => Date.now(), mediaHosts = [] } = {}) {
    this.fetcher = fetcher; this.now = now; this.mediaHosts = new Set(mediaHosts); this.sessions = new Map(); this.frames = new Map(); this.pending = new Map(); this.streams = new Map(); this.streamPending = new Map();
    this.cleanup = setInterval(() => this.prune(), 10_000); this.cleanup.unref();
  }
  prune() {
    for (const [owner, session] of this.sessions) if (session.expiresAt <= this.now()) this.disconnect(owner);
    for (const [id, frame] of this.frames) if (frame.expiresAt <= this.now()) this.frames.delete(id);
    for (const [id, stream] of this.streams) if (stream.expiresAt <= this.now()) void this.stopLive(stream.owner, id);
  }
  session(owner) { this.prune(); return this.sessions.get(owner) || fail(409, "Connect a current Ring Playground token first.", "ring_disconnected"); }
  status(owner) {
    this.prune(); const s = this.sessions.get(owner);
    return s ? { connected: true, expiresAt: s.expiresAt, verifiedAt: s.verifiedAt, devices: s.devices, credentialStorage: "server-memory" } : { connected: false, devices: [] };
  }
  async request(url, options) {
    try { return await this.fetcher(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(15_000) }); }
    catch { return fail(502, "The Ring request timed out or could not connect. Try again; no observation was released.", "ring_network"); }
  }
  async connect(owner, token, consent) {
    if (consent !== true) fail(400, "Confirm authorization to use the devices shared with this token.");
    token = text(token, "Ring token", 20, 16_384);
    if (!/^[A-Za-z0-9._~+/=-]+$/.test(token)) fail(400, "Paste the access token only, without a Bearer prefix.");
    this.prune();
    if (!this.sessions.has(owner) && this.sessions.size >= 50) fail(429, "The temporary Ring connection limit has been reached. Try again later.");
    this.disconnect(owner);
    const connection = Symbol(); this.pending.set(owner, connection);
    try {
    const response = await this.request(`${API}/v1/devices?include=status,capabilities`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" } });
    if (response.status !== 200) { await response.body?.cancel(); return upstreamStatus(response.status); }
    let payload; try { payload = JSON.parse((await bounded(response, 1_000_000)).toString("utf8")); } catch (error) { if (error instanceof Fault) throw error; return badResponse(); }
    if (!Array.isArray(payload.data) || payload.data.length > 200 || payload.data.some(d => !d || typeof d !== "object") || (payload.included !== undefined && !Array.isArray(payload.included))) return badResponse();
    const devices = payload.data.filter(d => d.type === "devices").map(d => {
      if (typeof d.id !== "string" || !d.id || d.id.length > 256) return badResponse();
      const included = rel => payload.included?.find(i => i.type === d.relationships?.[rel]?.data?.type && i.id === d.relationships?.[rel]?.data?.id)?.attributes;
      const capabilities = included("capabilities"), status = included("status");
      const components = capabilities?.components?.items;
      if (capabilities?.components && (!Array.isArray(components) || !components.length)) return badResponse();
      return { id: d.id, name: typeof d.attributes?.name === "string" ? d.attributes.name.slice(0, 100) : "Ring device", online: typeof status?.online === "boolean" ? status.online : null, camera: Boolean(capabilities?.video || components?.some(c => c.component_type === "lens")), capabilitiesKnown: Boolean(capabilities), components: Array.isArray(components) ? components.map(c => ({ id: text(c.component_id, "Camera module", 1, 100), name: typeof c.component_name === "string" ? c.component_name.slice(0, 80) : `Camera module ${c.component_id}` })) : [] };
    });
    if (this.pending.get(owner) !== connection) fail(409, "The Ring connection was cancelled. Connect again when ready.", "ring_disconnected");
    this.pending.delete(owner);
    this.sessions.set(owner, { token, devices, expiresAt: this.now() + SESSION_MS, verifiedAt: this.now() });
    return this.status(owner);
    } finally { if (this.pending.get(owner) === connection) this.pending.delete(owner); }
  }
  disconnect(owner) { this.pending.delete(owner); this.streamPending.delete(owner); this.sessions.delete(owner); for (const [id, frame] of this.frames) if (frame.owner === owner) this.frames.delete(id); for (const [id, stream] of this.streams) if (stream.owner === owner) void this.stopLive(owner, id); }
  async stopLive(owner, id) {
    const stream = this.streams.get(id);
    if (!stream || stream.owner !== owner) return;
    this.streams.delete(id);
    try {
      const response = await this.request(stream.url, { method: "DELETE", headers: { Authorization: `Bearer ${stream.token}` } });
      await response.body?.cancel();
    } catch { /* Local access is closed even if Ring's session already expired. */ }
  }
  async startLive(owner, { deviceId, componentId = null, sdp, jobId = null, passId = null, cameraId = null, expiresAt = Infinity }) {
    const session = this.session(owner), device = session.devices.find(d => d.id === deviceId);
    if (!device?.camera || !device.capabilitiesKnown) fail(400, "Select a camera returned by Ring device discovery.", "ring_device");
    if (device.components.length ? !device.components.some(c => c.id === componentId) : componentId !== null) fail(400, "Choose the exact camera module returned by Ring.", "ring_component");
    if (typeof sdp !== "string" || sdp.length > 100_000 || !sdp.startsWith("v=0")) fail(400, "A valid video offer is required.");
    if (this.streamPending.has(owner) || [...this.streams.values()].some(s => s.owner === owner)) fail(409, "Stop the current private live view before starting another.");
    const pending = Symbol(); this.streamPending.set(owner, pending);
    const path = `/v1/devices/${encodeURIComponent(deviceId)}/media/streaming/whep/sessions`;
    let streamId;
    try {
      const response = await this.request(`${API}${path}${componentId ? `?component_id=${encodeURIComponent(componentId)}` : ""}`, {
        method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/sdp" }, body: sdp,
      });
      if (response.status !== 201) { await response.body?.cancel(); return upstreamStatus(response.status); }
      let location; try { location = new URL(response.headers.get("location"), API); } catch { await response.body?.cancel(); return badResponse(); }
      if (location.origin !== API || location.username || location.password || location.hash || !location.pathname.startsWith(`${path}/`) || !/^[A-Za-z0-9_-]+$/.test(location.pathname.slice(path.length + 1))) { await response.body?.cancel(); return badResponse(); }
      streamId = randomUUID();
      this.streams.set(streamId, { owner, token: session.token, url: location.href, deviceId, componentId, deviceName: device.name, jobId, passId, cameraId, expiresAt: Math.min(expiresAt, session.expiresAt, this.now() + 120_000) });
      if (response.headers.get("content-type")?.split(";")[0] !== "application/sdp") return badResponse();
      const answer = (await bounded(response, 100_000)).toString("utf8");
      if (!answer.startsWith("v=0")) return badResponse();
      if (this.sessions.get(owner) !== session || this.streamPending.get(owner) !== pending || session.expiresAt <= this.now()) fail(409, "The Ring connection ended while live view was starting.", "ring_disconnected");
      const stream = this.streams.get(streamId);
      if (!stream || stream.expiresAt <= this.now()) fail(409, "This private live view ended while it was starting. Start it again if access is still available.", "ring_live");
      return { id: streamId, sdp: answer, expiresAt: stream.expiresAt };
    } catch (error) {
      if (streamId) await this.stopLive(owner, streamId);
      throw error;
    } finally { if (this.streamPending.get(owner) === pending) this.streamPending.delete(owner); }
  }
  live(owner, id) {
    this.session(owner);
    const stream = this.streams.get(id);
    if (!stream || stream.owner !== owner) fail(404, "This private live view ended. Start it again.", "ring_live");
    return stream;
  }
  stopScope(owner, key, value) {
    for (const [id, stream] of this.streams) if (stream.owner === owner && stream[key] === value) void this.stopLive(owner, id);
    for (const [id, frame] of this.frames) if (frame.owner === owner && frame[key] === value) this.frames.delete(id);
  }
  discardFrame(owner, id) {
    if (this.frames.get(id)?.owner === owner) this.frames.delete(id);
  }
  captureLive(owner, id, image) {
    const stream = this.live(owner, id);
    if (!Buffer.isBuffer(image) || !image.length) fail(400, "Capture a private video frame first.");
    // The authenticated stream establishes permitted scope, not authenticity or capture
    // time of browser-submitted pixels. Never promote this image to timestamped Ring media.
    for (const [key, frame] of this.frames) if (frame.owner === owner && frame.jobId === stream.jobId) this.frames.delete(key);
    const stored = [...this.frames.values()].reduce((sum, frame) => sum + frame.image.length, 0);
    if (stored + image.length > 64 * 1024 * 1024 || this.frames.size >= 100) fail(429, "The temporary image limit has been reached. Wait a few minutes and retry.");
    const frame = { id: randomUUID(), owner, jobId: stream.jobId, passId: stream.passId, cameraId: stream.cameraId, image, deviceId: stream.deviceId, componentId: stream.componentId, deviceName: stream.deviceName, capturedAt: null, downloadedAt: this.now(), mediaOrigin: "browser-live-capture", requestId: "", sourceTimeVerified: false, expiresAt: this.now() + FRAME_MS };
    this.frames.set(frame.id, frame);
    return this.publicFrame(frame);
  }
  async snapshot(owner, { deviceId, componentId = null, jobId = null, passId = null, cameraId = null }) {
    const session = this.session(owner), device = session.devices.find(d => d.id === deviceId);
    if (!device || !device.capabilitiesKnown || !device.camera) fail(400, "Select a camera returned by Ring device discovery.", "ring_device");
    // Offline cameras can still have authorized stored footage. Let Ring determine
    // availability; source timestamps below determine whether it can support an answer.
    if (device.components.length ? !device.components.some(c => c.id === componentId) : componentId !== null) fail(400, "Choose the exact camera module returned by Ring.", "ring_component");
    // Device discovery confirms access now, not permission to retrieve earlier footage.
    // Ring rejects the entire request when its range precedes the token's consent.
    const end = this.now(), start = Math.max(session.verifiedAt, end - (jobId ? 60_000 : 86_400_000));
    const response = await this.request(`${API}/v1/devices/${encodeURIComponent(deviceId)}/media/image/download`, {
      method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "latest_in_range", start_timestamp: start, end_timestamp: end, image_options: { format: "jpeg" }, ...(componentId ? { components: [{ component_id: componentId }] } : {}) }),
    });
    if (response.status !== 303) { await response.body?.cancel(); return upstreamStatus(response.status); }
    let media; try { media = new URL(response.headers.get("location")); } catch { return badResponse(); }
    await response.body?.cancel();
    if (media.protocol !== "https:" || media.username || media.password || (media.port && media.port !== "443") || !(media.hostname === "api.amazonvision.com" || media.hostname.endsWith(".amazonvision.com") || this.mediaHosts.has(media.hostname))) fail(502, "Ring returned a download host that this deployment has not approved. Ask the operator to verify its hostname.", "ring_media_host");
    // The pre-signed URL carries its own scoped authority. Never forward the Ring bearer token.
    const content = await this.request(media.href, { headers: { Accept: "image/jpeg, image/png" } });
    if (content.status !== 200) { await content.body?.cancel(); return upstreamStatus(content.status); }
    if (!["image/jpeg", "image/png"].includes(content.headers.get("content-type")?.split(";")[0])) { await content.body?.cancel(); return badResponse(); }
    const bytes = await bounded(content, 8 * 1024 * 1024);
    const stamp = content.headers.get("x-media-timestamp");
    const rawTime = stamp && /^\d{10,16}$/.test(stamp) ? Number(stamp) : null;
    const timestampValid = Number.isSafeInteger(rawTime) && rawTime >= start && rawTime <= end;
    const mediaOrigin = content.headers.get("x-media-origin");
    const provenanceKnown = ["recording", "snapshot"].includes(mediaOrigin);
    let image; try { image = await sharp(bytes, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); } catch { return fail(502, "The Ring image could not be decoded. No observation was released.", "ring_image"); }
    if (this.sessions.get(owner) !== session || session.expiresAt <= this.now()) fail(409, "The Ring connection ended while the image was loading. Reconnect and try again.", "ring_disconnected");
    this.prune();
    for (const [id, f] of this.frames) if (f.owner === owner && f.jobId === jobId) this.frames.delete(id);
    const stored = [...this.frames.values()].reduce((sum, f) => sum + f.image.length, 0);
    if (stored + image.length > 64 * 1024 * 1024 || this.frames.size >= 100) fail(429, "The temporary image limit has been reached. Wait a few minutes and retry.");
    const frame = { id: randomUUID(), owner, jobId, passId, cameraId, image, deviceId, deviceName: device.name, componentId, capturedAt: timestampValid ? rawTime : null, downloadedAt: this.now(), mediaOrigin: provenanceKnown ? mediaOrigin : "unknown", requestId: (content.headers.get("x-request-id") || response.headers.get("x-request-id") || "").slice(0, 160), sourceTimeVerified: timestampValid && provenanceKnown, expiresAt: this.now() + FRAME_MS };
    this.frames.set(frame.id, frame); return this.publicFrame(frame);
  }
  frame(owner, id, jobId) {
    this.session(owner); const frame = this.frames.get(id);
    if (!frame || frame.owner !== owner || (jobId !== undefined && frame.jobId !== jobId)) fail(404, "The private Ring image expired or is not available for this check. Fetch it again.", "ring_frame");
    return frame;
  }
  publicFrame(frame) { const { image, owner, ...metadata } = frame; return { ...metadata, provider: frame.mediaOrigin === "browser-live-capture" ? "ring-live-browser-capture" : "ring-api", fresh: frame.sourceTimeVerified && this.now() - frame.capturedAt <= 60_000 }; }
  close() { clearInterval(this.cleanup); for (const owner of this.sessions.keys()) this.disconnect(owner); this.pending.clear(); this.streamPending.clear(); this.frames.clear(); }
}
