import { useEffect, useState } from "react";
import { RingLiveView } from "./ring-live";

export type RingFrame = { id: string; deviceName: string; capturedAt: number | null; downloadedAt: number; mediaOrigin: string; sourceTimeVerified: boolean; fresh: boolean; reviewedAt?: number };
type Device = { id: string; name: string; online: boolean | null; camera: boolean; capabilitiesKnown: boolean; components: { id: string; name: string }[] };
type RingStatus = { connected: boolean; expiresAt?: number; devices: Device[] };
type Call = (path: string, method?: string, body?: unknown) => Promise<any>;
const when = (n: number) => new Date(n).toLocaleString();

export function RingSource({ call, onUse }: { call: Call; onUse: (frame: RingFrame) => void }) {
  const [status, setStatus] = useState<RingStatus | null>(null), [token, setToken] = useState(""), [device, setDevice] = useState(""), [component, setComponent] = useState("");
  const [frame, setFrame] = useState<RingFrame | null>(null), [busy, setBusy] = useState(""), [error, setError] = useState("");
  useEffect(() => { let active = true; call("/ring").then(data => { if (active) setStatus(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [call]);
  const selected = status?.devices.find(d => d.id === device);
  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const consent = new FormData(e.currentTarget).get("consent") === "on";
    setBusy("connect"); setError(""); setFrame(null);
    try { setStatus(await call("/ring/connect", "POST", { token, consent })); setToken(""); setDevice(""); setComponent(""); }
    catch (e) { setError((e as Error).message); setStatus({ connected: false, devices: [] }); }
    finally { setBusy(""); setToken(""); }
  }
  return <section className="ring-source">
    <div className="page-title"><div><h1>A Ring image. A smaller answer.</h1><p>Bring an authorized Ring source into your private workspace. You still decide what the recipient can learn.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    {!status ? <p role="status">Checking this workspace’s Ring connection…</p> : status.connected ? <>
      <div className="ring-connection-status"><div><strong>Ring token connected</strong><p>Device discovery succeeded. Temporary access ends by {when(status.expiresAt!)}; Ring may expire the token sooner.</p></div><button className="outline" disabled={!!busy} onClick={async () => { setBusy("disconnect"); setError(""); try { setStatus(await call("/ring", "DELETE")); setFrame(null); } catch (e) { setError((e as Error).message); } finally { setBusy(""); } }}>Disconnect</button></div>
      {status.devices.length ? <div className="editor-layout ring-source-layout"><section className="editor-form">
        <h2>Choose the source.</h2>
        <label>Ring device<select value={device} onChange={e => { setDevice(e.target.value); setComponent(""); setFrame(null); }} disabled={!!busy}><option value="">Choose an authorized camera</option>{status.devices.map(d => <option key={d.id} value={d.id} disabled={!d.camera || !d.capabilitiesKnown}>{d.name}{d.online === false ? " · Offline" : !d.camera ? " · Not a camera" : ""}</option>)}</select></label>
        {!!selected?.components.length && <label>Camera module<select value={component} onChange={e => { setComponent(e.target.value); setFrame(null); }} disabled={!!busy}><option value="">Choose one camera module</option>{selected.components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <p>Fetch a recorded image, or save a private frame from the live view below. A definite answer requires a separate recent image with a verified Ring capture time.</p>
        {selected?.online === false && <p className="form-note">Ring reports this camera offline. Stored footage may still be available; an old image cannot support a current answer.</p>}
        <button className="primary" disabled={!!busy || !selected || (!!selected.components.length && !component)} aria-busy={busy === "fetch"} onClick={async () => { setBusy("fetch"); setError(""); setFrame(null); try { setFrame(await call("/ring/reference", "POST", { deviceId: device, componentId: component || null })); } catch (e) { setError((e as Error).message); } finally { setBusy(""); } }}>{busy === "fetch" ? "Fetching private Ring image…" : "Fetch reference image"}</button>
        <p className="form-note">No image available? The download API reads existing recordings. Start an authorized live view or an official Playground event, then fetch again.</p>
      </section><section className="ring-reference-preview">{frame ? <><img src={`/api/ring/frames/${frame.id}`} alt="Private reference fetched through Ring’s official API" /><RingProvenance frame={frame} /><button className="primary" onClick={() => onUse(frame)}>Mark the approved area</button></> : <div className="ring-preview-empty"><h2>Your image stays here.</h2><p>Fetch a reference, name one object, then mark the area a pass may ask about. The recipient never receives this image.</p></div>}</section></div> : <div className="empty-state"><h2>No devices returned by Ring.</h2><p>This token is connected, but Ring has not made a camera available to it. Check the Playground or the devices shared with your integration.</p></div>}
      {selected && (!selected.components.length || component) && <RingLiveView key={`${device}:${component}`} call={call} deviceId={device} componentId={component || null} onCapture={onUse} />}
    </> : <div className="editor-layout ring-source-layout"><section className="editor-form"><h2>Connect a Playground token.</h2><form onSubmit={connect}>
      <label>Short-lived Ring access token<input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={20} maxLength={16384} value={token} onChange={e => setToken(e.target.value)} aria-describedby="ring-token-note" /></label>
      <p id="ring-token-note" className="form-note">The token is kept only in server memory for this account, for at most 30 minutes. It is cleared on disconnect, sign-out or server restart.</p>
      <label className="check-label"><input type="checkbox" name="consent" required /><span>I am authorized to access the Ring devices and imagery shared with this token.</span></label>
      <button className="primary" disabled={!!busy} aria-busy={busy === "connect"}>{busy === "connect" ? "Checking Ring access…" : "Connect and discover devices"}</button>
    </form></section><aside className="ring-setup-notes"><h2>Use the official source.</h2><p>Generate a short-lived token in the Ring Developer Playground. Its official simulations include Package, Vehicle and Motion events.</p><a className="text-button" href="https://developer.amazon.com/ring/console/playground" target="_blank" rel="noreferrer">Open Ring Developer Playground</a><p>These simulations require Playground access. Aperture does not generate or substitute simulated Ring footage.</p><p>You can continue using uploaded references and your own observations while Ring is disconnected.</p></aside></div>}
  </section>;
}
export function RingProvenance({ frame }: { frame: RingFrame }) {
  const live = frame.mediaOrigin === "browser-live-capture";
  return <dl className="ring-provenance"><div><dt>Source</dt><dd>{live ? "Ring live view · browser-saved frame" : `Ring API · ${frame.mediaOrigin}`}</dd></div><div><dt>Ring frame captured</dt><dd>{frame.capturedAt ? when(frame.capturedAt) : "Timestamp unavailable"}</dd></div><div><dt>{live ? "Frame received by Aperture" : "Image downloaded"}</dt><dd>{when(frame.downloadedAt)}</dd></div>{frame.reviewedAt && <div><dt>Owner approved review</dt><dd>{when(frame.reviewedAt)}</dd></div>}{!frame.sourceTimeVerified && <div><dt>Freshness</dt><dd>Source time could not be verified. Only “Cannot verify” can be released.{live ? " A recent save or review does not establish when Ring recorded the scene." : ""}</dd></div>}</dl>;
}
