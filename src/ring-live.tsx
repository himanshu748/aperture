import { useEffect, useRef, useState } from "react";
import type { RingFrame } from "./ring-source";

type Call = (path: string, method?: string, body?: unknown) => Promise<any>;

export function RingLiveView({ call, deviceId, componentId, jobId, onCapture }: { call: Call; deviceId: string; componentId: string | null; jobId?: string; onCapture?: (frame: RingFrame) => void }) {
  const video = useRef<HTMLVideoElement>(null), peer = useRef<RTCPeerConnection | null>(null);
  const sessionId = useRef<string | null>(null), generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [state, setState] = useState<"idle" | "connecting" | "playing">("idle"), [error, setError] = useState("");

  function release() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pc = peer.current; peer.current = null;
    if (pc) { pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    if (video.current) video.current.srcObject = null;
    const id = sessionId.current; sessionId.current = null;
    if (id) void call(`/ring/live/${id}`, "DELETE").catch(() => {});
  }
  function stop() { release(); setState("idle"); }
  useEffect(() => { setState("idle"); setError(""); return release; }, [deviceId, componentId, jobId, call]);

  async function start() {
    release(); const attempt = generation.current;
    setError(""); setState("connecting");
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peer.current = pc;
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.ontrack = event => {
        if (generation.current !== attempt || !video.current) return;
        video.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        void video.current.play().catch(() => { setError("Select Play on the video to view the stream."); });
      };
      pc.onconnectionstatechange = () => {
        if (generation.current !== attempt) return;
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          stop(); setError("The private stream ended. Start another Playground event to reconnect.");
        }
      };
      timer.current = setTimeout(() => { if (generation.current === attempt) { stop(); setError("Ring did not deliver video in time. Start a Playground event and try again."); } }, 30_000);
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>(resolve => {
        if (pc.iceGatheringState === "complete") return resolve();
        const done = () => { clearTimeout(timeout); pc.removeEventListener("icegatheringstatechange", changed); resolve(); };
        const changed = () => { if (pc.iceGatheringState === "complete") done(); };
        const timeout = setTimeout(done, 3000);
        pc.addEventListener("icegatheringstatechange", changed);
      });
      if (generation.current !== attempt) return;
      const stream = await call(jobId ? `/checks/${jobId}/ring-live` : "/ring/live", "POST", jobId ? { sdp: pc.localDescription!.sdp } : { deviceId, componentId, sdp: pc.localDescription!.sdp });
      if (generation.current !== attempt) { await call(`/ring/live/${stream.id}`, "DELETE"); return; }
      sessionId.current = stream.id;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { stop(); setError("This private live view expired. Start it again if access is still available."); }, Math.max(0, stream.expiresAt - Date.now()));
      await pc.setRemoteDescription({ type: "answer", sdp: stream.sdp });
    } catch (e) {
      if (generation.current !== attempt) return;
      stop(); setError((e as Error).message);
    }
  }

  async function capture() {
    const element = video.current, id = sessionId.current, attempt = generation.current;
    if (!element || !id || element.paused || element.ended || element.readyState < 2 || !element.videoWidth) {
      setError("Wait for the private video to play before saving a frame."); return;
    }
    setCapturing(true); setError("");
    try {
      const canvas = document.createElement("canvas"), scale = Math.min(1, 1600 / Math.max(element.videoWidth, element.videoHeight));
      canvas.width = Math.round(element.videoWidth * scale); canvas.height = Math.round(element.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not save this video frame.");
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const frame = await call(`/ring/live/${id}/frame`, "POST", { image: canvas.toDataURL("image/jpeg", 0.85) });
      if (generation.current !== attempt) {
        await call(`/ring/frames/${frame.id}`, "DELETE");
        return;
      }
      stop(); onCapture?.(frame);
    } catch (e) { if (generation.current === attempt) setError((e as Error).message); }
    finally { setCapturing(false); }
  }

  return <section className="ring-live-view">
    <h2>Private live view.</h2>
    <p>View the selected Ring source here. Only this owner workspace receives the video; recipients receive no stream.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <video ref={video} controls muted playsInline aria-label="Private Ring live view" style={{ width: "100%", aspectRatio: "16 / 9", maxHeight: "52vh", objectFit: "contain", background: "#18201b", borderRadius: 12 }} onPlaying={() => {
      if (!peer.current) return;
      setState("playing"); setError("");
    }} onWaiting={() => { if (peer.current) setState("connecting"); }} onPause={() => { if (peer.current) setState("connecting"); }} />
    <p role="status">{state === "playing" ? "Receiving Ring video · private to you" : state === "connecting" ? "Connecting to Ring…" : "Live view is stopped."}</p>
    {state === "idle" ? <button type="button" className="outline" onClick={() => void start()}>Start private live view</button> : <button type="button" className="outline" onClick={stop}>Stop private live view</button>}
    {onCapture && <button type="button" className="primary" disabled={state !== "playing" || capturing} onClick={() => void capture()}>{capturing ? "Saving private frame…" : jobId ? "Save frame for this review" : "Use this frame as a private reference"}</button>}
    {onCapture && <p className="form-note">Saved frames come from your browser. Ring does not provide a capture timestamp for this video path, so these frames can support only “Cannot verify,” never a claim about current visibility.</p>}
    <p className="form-note">For the official simulator, start Package, Vehicle or Motion in Ring Playground, then connect here while the event is active. Saving a frame does not create a Ring archived snapshot or approve a recipient answer.</p>
  </section>;
}
