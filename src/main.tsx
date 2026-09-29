import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { PrivacyCutaway } from "./privacy-cutaway";
import { RingSource, RingProvenance, type RingFrame } from "./ring-source";
import { RingLiveView } from "./ring-live";
type Region = { x: number; y: number; width: number; height: number };
type Camera = {
  id: string;
  name: string;
  object: string;
  area: string;
  region: Region;
  created: number;
  ringSource?: { deviceId: string; componentId: string | null } | null;
};
type Pass = {
  id: string;
  camera_id: string;
  label: string;
  question: string;
  expires: number;
  budget: number;
  used: number;
  cooldown: number;
  revoked: number | null;
  status: string;
};
type Job = {
  id: string;
  created: number;
  passId: string;
  label: string;
  question: string;
  camera_id: string;
};
type Receipt = {
  id: string;
  action: string;
  created: number;
  detail: Record<string, unknown>;
};
type Workspace = {
  cameras: Camera[];
  passes: Pass[];
  pending: Job[];
  receipts: Receipt[];
};
type User = { name: string; email: string };
const date = (n: number) =>
  new Date(n).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
function ago(n: number) {
  const sec = Math.max(0, Math.floor((Date.now() - n) / 1000));
  return sec < 60
    ? `${sec}s ago`
    : sec < 3600
      ? `${Math.floor(sec / 60)}m ago`
      : date(n);
}
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error || "Request failed.", res.status);
  return data;
}
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    aperture: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 4 5 8-5 8m10-3H9L5 10m2-5 4 7h10" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    plus: <path d="M12 4v16M4 12h16" />,
    frame: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="m4 16 5-5 4 4 3-3 5 5" />
        <circle cx="16" cy="8" r="1" />
      </>
    ),
    link: (
      <>
        <path d="m9 8 2-2a5 5 0 0 1 7 7l-2 2M15 16l-2 2a5 5 0 0 1-7-7l2-2M8 16l8-8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    receipt: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />
      </>
    ),
    logout: <path d="M9 4H4v16h5m1-8h11m-4-4 4 4-4 4" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="1" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    download: <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.aperture}
    </svg>
  );
}
function Brand() {
  return (
    <a className="brand" href="/">
      <Icon name="aperture" size={30} />
      Aperture<span className="brand-dot">.</span>
    </a>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
function Button({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={busy || props.disabled} aria-busy={busy}>
      {busy ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}
async function readPhoto(file: File | undefined) {
  if (!file) return "";
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use a JPEG, PNG or WebP photo.");
  return await new Promise<string>((r, j) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result));
    fr.onerror = () => j(new Error("This photo could not be read."));
    fr.readAsDataURL(file);
  });
}
function RegionView({
  src,
  region,
  onChange,
}: {
  src: string;
  region: Region;
  onChange?: (r: Region) => void;
}) {
  const holder = useRef<HTMLDivElement>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const point = (e: React.PointerEvent) => {
    const r = holder.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  return (
    <div
      className={`photo-region ${onChange ? "editable" : ""}`}
      ref={holder}
      onPointerDown={(e) => {
        if (!onChange) return;
        start.current = point(e);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!onChange || !start.current) return;
        const p = point(e),
          s = start.current;
        onChange({
          x: Math.min(s.x, p.x),
          y: Math.min(s.y, p.y),
          width: Math.max(0.05, Math.abs(p.x - s.x)),
          height: Math.max(0.05, Math.abs(p.y - s.y)),
        });
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    >
      <img
        src={src}
        alt="Owner's private reference photograph"
        draggable={false}
      />
      <span
        className="region-shade"
        style={{
          clipPath: `polygon(0% 0%,0% 100%,100% 100%,100% 0%,0% 0%,${region.x * 100}% ${region.y * 100}%,${(region.x + region.width) * 100}% ${region.y * 100}%,${(region.x + region.width) * 100}% ${(region.y + region.height) * 100}%,${region.x * 100}% ${(region.y + region.height) * 100}%,${region.x * 100}% ${region.y * 100}%)`,
        }}
      />
      <span
        className="region-box"
        style={{
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.width * 100}%`,
          height: `${region.height * 100}%`,
        }}
      >
        <span>Approved area</span>
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
function Landing({ onAuth }: { onAuth: () => void }) {
  return (
    <>
      <header className="public-header">
        <Brand />
        <div className="header-links">
          <a href="#how-it-works">How it works</a>
          <button className="text-button" onClick={onAuth}>
            Open workspace <Icon name="arrow" />
          </button>
        </div>
      </header>
      <main className="landing">
        <section className="landing-intro">
          <div>
            <h1>
              Share the answer.
              <br />
              <em>Keep the view.</em>
            </h1>
            <p>
              A small permission for a specific question. Give someone an
              expiring pass to check an object, without sharing your camera.
            </p>
            <button className="primary" onClick={onAuth}>
              Create your first pass <Icon name="arrow" />
            </button>
            <span className="small-note">
              Private workspace. No camera connection required.
            </span>
          </div>
          <PrivacyCutaway />
        </section>
        <section className="mechanism" id="how-it-works">
          <h2>
            A little less
            <br /> to share.
          </h2>
          <div className="mechanism-list">
            <article>
              <h3>Frame the question.</h3>
              <p>
                Use your own reference photo, mark the exact area, and name the
                object the pass is allowed to ask about.
              </p>
            </article>
            <article>
              <h3>Set the permission.</h3>
              <p>
                You choose when the link expires, how many checks it allows, and
                the space between requests. Revoke it whenever you need.
              </p>
            </article>
            <article>
              <h3>Answer on your terms.</h3>
              <p>
                Record what you actually observed. The recipient receives only
                the bounded answer and its observation time.
              </p>
            </article>
          </div>
        </section>
        <section className="honesty">
          <Icon name="eye" size={28} />
          <div>
            <h3>Human observation, clearly stated.</h3>
            <p>
              The owner approves every check, using their own observation or a
              snapshot fetched through an authorized Ring connection. Automated
              recognition is not connected. Old or uncertain evidence returns “Cannot verify.”
            </p>
          </div>
          <button className="outline" onClick={onAuth}>
            Start a workspace <Icon name="arrow" />
          </button>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <p>Permission comes before observation.</p>
        <span>Built for deliberate sharing.</span>
      </footer>
    </>
  );
}
function Auth({
  onSuccess,
  onBack,
}: {
  onSuccess: (u: User) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"register" | "login">("register"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      let b: Record<string, unknown> = {
        email: f.get("email"),
        password: f.get("password"),
      };
      if (mode === "register") b.name = f.get("name");
      onSuccess((await api(`/${mode}`, "POST", b)).user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header className="public-header">
        <Brand />
        <button className="text-button" onClick={onBack}>
          Back to Aperture
        </button>
      </header>
      <main className="auth-layout">
        <div className="auth-statement">
          <h1>
            A question
            <br /> of <em>permission.</em>
          </h1>
          <p>
            Your photos, passes and observations stay in your private workspace.
            Share only the answer you approve.
          </p>
          <div className="auth-seal">
            <Icon name="aperture" size={92} />
          </div>
        </div>
        <section className="auth-form">
          <div className="segmented">
            <button
              className={mode === "register" ? "selected" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Create account
            </button>
            <button
              className={mode === "login" ? "selected" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
          </div>
          <h2>
            {mode === "register" ? "Make room for less." : "Welcome back."}
          </h2>
          <p>
            {mode === "register"
              ? "Start with an empty, private workspace."
              : "Your references and passes are right where you left them."}
          </p>
          <form onSubmit={submit}>
            <ErrorBox message={error} />
            {mode === "register" && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  autoComplete="name"
                  maxLength={80}
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={mode === "register" ? 12 : 1}
                maxLength={128}
                required
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
              <small>
                {mode === "register"
                  ? "At least 12 characters. Save it in your password manager."
                  : "Use the password you created for Aperture."}
              </small>
            </label>
            <Button className="primary full" busy={busy}>
              {mode === "register" ? "Create private workspace" : "Sign in"}
              <Icon name="arrow" />
            </Button>
            <p className="form-note">
              Email recovery is not configured in this self-hosted release. Your
              email identifies your account; no email is sent.
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
function AddReference({
  ringFrame,
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
  ringFrame?: RingFrame | null;
}) {
  const [photo, setPhoto] = useState(ringFrame ? `/api/ring/frames/${ringFrame.id}` : ""),
    [region, setRegion] = useState<Region>({
      x: 0.15,
      y: 0.15,
      width: 0.7,
      height: 0.7,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    let f = new FormData(e.currentTarget);
    try {
      await api(ringFrame ? "/cameras/ring" : "/cameras", "POST", {
        name: f.get("name"),
        object: f.get("object"),
        area: f.get("area"),
        region,
        consent: f.get("consent") === "on",
        ...(ringFrame ? { frameId: ringFrame.id } : { image: photo }),
      });
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Frame your question.</h1>
          <p>
            A reference stays private. Only the approved observation can be
            shared.
          </p>
        </div>
        <button className="text-button" onClick={onCancel}>
          Cancel <Icon name="close" />
        </button>
      </div>
      <form onSubmit={submit} className="editor-layout">
        <section>
          {ringFrame ? <RingProvenance frame={ringFrame} /> : <label className={`upload-field ${photo ? "has-photo" : ""}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                setError("");
                try {
                  setPhoto(await readPhoto(e.target.files?.[0]));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
            <Icon name="frame" size={30} />
            <strong>
              {photo
                ? "Replace reference photo"
                : "Choose your reference photo"}
            </strong>
            <span>JPEG, PNG or WebP · Up to 5 MB</span>
          </label>}
          {photo && (
            <>
              <RegionView
                src={photo}
                region={region}
                onChange={(r) =>
                  setRegion({
                    ...r,
                    width: Math.min(r.width, 1 - r.x),
                    height: Math.min(r.height, 1 - r.y),
                  })
                }
              />
              <p className="image-caption">
                Drag on the photo to mark the area. You can also adjust its
                coordinates below.
              </p>
              <div className="region-inputs">
                {(["x", "y", "width", "height"] as const).map((k) => (
                  <label key={k}>
                    {k === "x"
                      ? "Left"
                      : k === "y"
                        ? "Top"
                        : k === "width"
                          ? "Width"
                          : "Height"}{" "}
                    %
                    <input
                      type="number"
                      min={k === "width" || k === "height" ? 5 : 0}
                      max={100}
                      step={1}
                      value={Math.round(region[k] * 100)}
                      onChange={(e) =>
                        setRegion({
                          ...region,
                          [k]: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="editor-form">
          <ErrorBox message={error} />
          <label>
            Reference name
            <input
              name="name"
              required
              maxLength={80}
              placeholder="A name you'll recognize"
            />
          </label>
          <label>
            The exact object
            <input
              name="object"
              required
              maxLength={100}
              placeholder="Describe the one object to check"
            />
            <small>Avoid people, identities and open-ended questions.</small>
          </label>
          <label>
            The approved area
            <input
              name="area"
              required
              maxLength={140}
              placeholder="Describe the marked location"
            />
          </label>
          <label className="check-label">
            <input type="checkbox" name="consent" required />
            <span>
              I own or am authorized to use this photo and the camera view. I
              have marked only the area needed for this question.
            </span>
          </label>
          <Button className="primary full" busy={busy} disabled={!photo}>
            Save private reference <Icon name="arrow" />
          </Button>
          <div className="privacy-note">
            <Icon name="lock" />
            <p>
              This image is visible only to you. Aperture removes embedded
              metadata and stores a resized copy.
            </p>
          </div>
        </section>
      </form>
    </>
  );
}
function CreatePass({
  cameras,
  initialId,
  onSave,
  onCancel,
}: {
  cameras: Camera[];
  initialId?: string;
  onSave: (out: any) => void;
  onCancel: () => void;
}) {
  const [cid, setCid] = useState(
      cameras.find((c) => c.id === initialId)?.id || cameras[0]?.id || "",
    ),
    [minutes, setMinutes] = useState(30),
    [budget, setBudget] = useState(5),
    [cooldown, setCooldown] = useState(60),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const c = cameras.find((c) => c.id === cid);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      onSave(
        await api("/passes", "POST", {
          cameraId: cid,
          label: f.get("label"),
          minutes,
          budget,
          cooldown,
          consent: f.get("consent") === "on",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h1>A precise permission.</h1>
          <p>Preview exactly what the recipient will be allowed to ask.</p>
        </div>
        <button className="text-button" onClick={onCancel}>
          Cancel <Icon name="close" />
        </button>
      </div>
      <form className="editor-layout" onSubmit={submit}>
        <section>
          {c && (
            <>
              <RegionView
                src={`/api/cameras/${c.id}/image`}
                region={c.region}
              />
              <div className="question-preview">
                <span>Approved question</span>
                <h2>
                  Is {c.object} visible in {c.area}?
                </h2>
                <p>
                  Visible · Not visible in the approved area · Cannot verify
                </p>
              </div>
            </>
          )}
        </section>
        <section className="editor-form">
          <ErrorBox message={error} />
          <label>
            Private pass label
            <input
              name="label"
              required
              maxLength={100}
              placeholder="Who or what this pass is for"
            />
          </label>
          <label>
            Reference
            <select value={cid} onChange={(e) => setCid(e.target.value)}>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Expires after
              <select
                value={minutes}
                onChange={(e) => setMinutes(+e.target.value)}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </label>
            <label>
              Check budget
              <input
                type="number"
                min={1}
                max={20}
                value={budget}
                onChange={(e) => setBudget(+e.target.value)}
              />
            </label>
          </div>
          <label>
            Minimum time between checks
            <select
              value={cooldown}
              onChange={(e) => setCooldown(+e.target.value)}
            >
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={900}>15 minutes</option>
            </select>
          </label>
          <label className="check-label">
            <input name="consent" type="checkbox" required />
            <span>
              I approve sharing this exact answer with anyone holding the link
              until it expires or I revoke it.
            </span>
          </label>
          <Button className="primary full" busy={busy}>
            Create expiring pass <Icon name="link" />
          </Button>
          <p className="form-note">
            You approve each answer yourself. For a Ring reference, fetch a recent
            snapshot when a check arrives. Keep this workspace open to respond.
          </p>
        </section>
      </form>
    </>
  );
}
function SharePass({ pass, onDone }: { pass: any; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/p/${pass.token}`;
  return (
    <section className="share-panel">
      <div className="round-icon">
        <Icon name="link" size={34} />
      </div>
      <h1>
        The permission is yours
        <br />
        to share.
      </h1>
      <p>{pass.question}</p>
      <label>
        Private bearer link
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="share-actions">
        <button
          className="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy pass link"}
        </button>
        <a
          className="button outline"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          Preview recipient view <Icon name="arrow" />
        </a>
      </div>
      <p className="form-note">
        Save this link now; it is shown only once. Anyone with it can request
        the approved fact. Expires {date(pass.expires)}.
      </p>
      <button className="text-button" onClick={onDone}>
        Back to passes
      </button>
    </section>
  );
}
function RecordCheck({
  job,
  camera,
  onSave,
}: {
  job: Job;
  camera: Camera;
  onSave: () => void;
}) {
  const [result, setResult] = useState("cannot_verify"),
    [photo, setPhoto] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [ringFrame, setRingFrame] = useState<RingFrame | null>(null);
  const [fetchingRing, setFetchingRing] = useState(false);
  const [observed, setObserved] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 19),
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const out = await api(`/checks/${job.id}/complete`, "POST", {
        result,
        ...(ringFrame ? { frameId: ringFrame.id } : { observedAt: new Date(observed).getTime(), image: photo || undefined }),
        note: f.get("note") || "",
        confirmed: f.get("confirmed") === "on",
      });
      if (out.blocked)
        setError(
          "The pass expired or was revoked. No observation was released.",
        );
      else onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="check-detail">
      <div className="check-heading">
        <div>
          <span className="status pending">Owner observation requested</span>
          <h2>{job.question}</h2>
          <p>
            {job.label} · Requested {ago(job.created)} · Times out after 2
            minutes
          </p>
        </div>
      </div>
      <form className="editor-layout" onSubmit={submit}>
        <section>
          <RegionView
            src={`/api/cameras/${camera.id}/image`}
            region={camera.region}
          />
          <p className="image-caption">
            Reference photo only. Make a current observation of this exact area
            before answering.
          </p>
          {camera.ringSource && <div className="ring-check-source">
            <h3>Review the Ring source.</h3>
            <p>Fetch a separate image from the last minute. Its captured-frame time comes from Ring, not your device clock.</p>
            <button type="button" className="outline" disabled={fetchingRing || busy} aria-busy={fetchingRing} onClick={async () => {
              setFetchingRing(true); setError(""); setRingFrame(null); setResult("cannot_verify");
              try { setRingFrame(await api(`/checks/${job.id}/ring-snapshot`, "POST", {})); }
              catch (e) { setError((e as Error).message); }
              finally { setFetchingRing(false); }
            }}>{fetchingRing ? "Fetching private Ring image…" : "Fetch Ring snapshot"}</button>
            <RingLiveView call={api} deviceId={camera.ringSource.deviceId} componentId={camera.ringSource.componentId} jobId={job.id} onCapture={frame => { setRingFrame(frame); setResult("cannot_verify"); }} />
            {ringFrame && <><RegionView src={`/api/ring/frames/${ringFrame.id}`} region={camera.region} /><RingProvenance frame={ringFrame} />
              <button type="button" className="text-button" onClick={() => { setRingFrame(null); setResult("cannot_verify"); }}>Use my own observation instead</button>
            </>}
          </div>}
        </section>
        <section className="editor-form">
          <ErrorBox message={error} />
          <fieldset>
            <legend>What can you verify?</legend>
            {[
              [
                "visible",
                "Visible",
                "The reference object is clearly visible in the approved area.",
              ],
              [
                "not_visible",
                "Not visible in the area",
                "The area is fully visible and the reference object is absent.",
              ],
              [
                "cannot_verify",
                "Cannot verify",
                "Obscured, dark, ambiguous, moved camera, or otherwise uncertain.",
              ],
            ].map(([v, title, desc]) => (
              <label
                className={`outcome ${result === v ? "chosen" : ""}`}
                key={v}
              >
                <input
                  type="radio"
                  name="result"
                  value={v}
                  checked={result === v}
                  disabled={fetchingRing || (!!ringFrame && !ringFrame.sourceTimeVerified && v !== "cannot_verify")}
                  onChange={() => setResult(v)}
                />
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {ringFrame ? <p className="form-note">A verified Ring capture time is required for a definite answer. Browser-saved live frames have no source timestamp and release only “Cannot verify.”</p> : <label>
            When you observed it
            <input
              type="datetime-local"
              value={observed}
              step={1}
              required
              onChange={(e) => setObserved(e.target.value)}
            />
            <button
              type="button"
              className="text-button small"
              onClick={() =>
                setObserved(
                  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 19),
                )
              }
            >
              Use current time
            </button>
            <small>
              Older than 60 seconds is released only as “Cannot verify.”
            </small>
          </label>}
          <label>
            Private note
            <textarea
              name="note"
              maxLength={1000}
              rows={2}
              placeholder="Optional context for your own record"
            />
          </label>
          {!ringFrame && <label>
            Private evidence photo (optional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                try {
                  setPhoto(await readPhoto(e.target.files?.[0]));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
            <small>Never shared with the recipient.</small>
          </label>}
          <label className="check-label" key={ringFrame?.id || "own-observation"}>
            <input type="checkbox" name="confirmed" required />
            <span>
              {ringFrame ? "I reviewed this Ring image against the exact reference and approved area. This is my interpretation, not automated recognition." : "I checked the approved area and recorded the actual observation time. This is a human observation."}
            </span>
          </label>
          <Button className="primary full" busy={busy} disabled={fetchingRing}>
            Release approved answer <Icon name="arrow" />
          </Button>
        </section>
      </form>
    </div>
  );
}
function PrivateRecord({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    [record, setRecord] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (open && !record)
      api(`/checks/${id}`)
        .then(setRecord)
        .catch((e) => setError(e.message));
  }, [open, id]);
  return (
    <details
      className="private-record"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>View private observation record</summary>
      {open && (
        <div>
          <ErrorBox message={error} />
          {record ? (
            <>
              <p>{record.note || "No private note was recorded."}</p>
              {record.source && <RingProvenance frame={record.source} />}
              {!!record.hasImage && (
                <img
                  src={`/api/checks/${id}/image`}
                  alt="Private evidence recorded by the owner"
                  loading="lazy"
                />
              )}
              <small>Only your account can access this evidence.</small>
            </>
          ) : (
            !error && <span className="spinner" />
          )}
        </div>
      )}
    </details>
  );
}
function Owner({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [tab, setTab] = useState("references"),
    [view, setView] = useState("list"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [share, setShare] = useState<any>(null),
    [selectedJob, setSelectedJob] = useState(""),
    [busy, setBusy] = useState(""),
    [deleteId, setDeleteId] = useState(""),
    [selectedCamera, setSelectedCamera] = useState("");
  const [ringFrame, setRingFrame] = useState<RingFrame | null>(null);
  const load = async () => {
    try {
      setWorkspace(await api("/workspace"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(t);
  }, []);
  const navigate = (next: string) => {
    setRingFrame(null);
    setTab(next);
    setView("list");
    setShare(null);
    setNotice("");
  };
  const done = async (msg: string) => {
    setRingFrame(null);
    await load();
    setView("list");
    setNotice(msg);
  };
  const w = workspace;
  let job = w?.pending.find((j) => j.id === selectedJob) || w?.pending[0];
  return (
    <div className="owner-shell">
      <aside className="rail">
        <Brand />
        <div className="workspace-name">
          <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{user.name}'s workspace</strong>
            <span>Private by default</span>
          </div>
        </div>
        <nav aria-label="Workspace">
          {[
            ["references", "frame", "References"],
            ["ring", "aperture", "Ring source"],
            ["passes", "link", "Shared passes"],
            ["checks", "eye", "Requested checks"],
            ["journal", "receipt", "Activity journal"],
          ].map(([v, icon, label]) => (
            <button
              key={v}
              onClick={() => navigate(v)}
              className={tab === v ? "active" : ""}
            >
              <Icon name={icon} />
              {label}
              {v === "checks" && !!w?.pending.length && (
                <span className="count">{w.pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <div className="provider-state">
            <span className="live-dot" />
            Human-approved answers<span>Uploaded or authorized Ring source</span>
          </div>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("/logout", "POST", {});
                onLogout();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="owner-main">
        <div className="topline">
          <span>
            <Icon name="lock" size={15} /> Only your account can view this
            workspace
          </span>
          <a className="text-button small" href="/api/export" download>
            <Icon name="download" size={16} />
            Export journal
          </a>
        </div>
        <ErrorBox message={error} />
        {notice && (
          <div className="notice" role="status">
            <Icon name="check" />
            {notice}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {!w ? (
          <div className="loading-state">
            <span className="spinner" />
            Opening your workspace…
          </div>
        ) : view === "add-reference" ? (
          <AddReference
            ringFrame={ringFrame}
            onSave={() => void done("Private reference saved.")}
            onCancel={() => { setRingFrame(null); setView("list"); }}
          />
        ) : view === "create-pass" ? (
          <CreatePass
            cameras={w.cameras}
            initialId={selectedCamera}
            onSave={(out) => {
              setShare(out);
              setView("share");
              void load();
            }}
            onCancel={() => setView("list")}
          />
        ) : share ? (
          <SharePass pass={share} onDone={() => navigate("passes")} />
        ) : (
          <>
            {tab === "ring" && <RingSource call={api} onUse={frame => { setRingFrame(frame); setTab("references"); setView("add-reference"); }} />}
            {tab === "references" && (
              <>
                <div className="page-title">
                  <div>
                    <h1>Your field of view.</h1>
                    <p>
                      Private reference photographs and the areas you approve.
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => setView("add-reference")}
                  >
                    <Icon name="plus" />
                    Add reference
                  </button>
                </div>
                {w.cameras.length === 0 ? (
                  <section className="empty-reference">
                    <div className="empty-frame">
                      <span />
                      <Icon name="frame" size={54} />
                      <span />
                    </div>
                    <div>
                      <h2>
                        Start with something
                        <br />
                        worth checking.
                      </h2>
                      <p>
                        Add your own photo. Mark the exact area and name the
                        object a recipient will be allowed to ask about.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setView("add-reference")}
                      >
                        Add your first reference <Icon name="arrow" />
                      </button>
                      <small>
                        Your workspace has no sample photos or observations.
                      </small>
                    </div>
                  </section>
                ) : (
                  <div className="references-grid">
                    {w.cameras.map((c) => (
                      <article className="reference" key={c.id}>
                        <RegionView
                          src={`/api/cameras/${c.id}/image`}
                          region={c.region}
                        />
                        <div className="reference-copy">
                          <div>
                            <h2>{c.name}</h2>
                            <p>
                              {c.object} · {c.area}
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Create pass for ${c.name}`}
                            onClick={() => {
                              navigate("passes");
                              setSelectedCamera(c.id);
                              setView("create-pass");
                            }}
                          >
                            <Icon name="arrow" />
                          </button>
                        </div>
                        <div className="reference-footer">
                          <span>
                            <Icon name="lock" size={14} />
                            Private reference
                          </span>
                          {deleteId === c.id ? (
                            <div className="delete-confirm">
                              <span>Delete photo and revoke its passes?</span>
                              <Button
                                className="text-button danger"
                                busy={busy === c.id}
                                onClick={async () => {
                                  setBusy(c.id);
                                  try {
                                    await api(`/cameras/${c.id}`, "DELETE");
                                    setDeleteId("");
                                    await done(
                                      "Reference deleted and its passes removed.",
                                    );
                                  } catch (e) {
                                    setError((e as Error).message);
                                  } finally {
                                    setBusy("");
                                  }
                                }}
                              >
                                Delete
                              </Button>
                              <button
                                className="text-button"
                                onClick={() => setDeleteId("")}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="text-button small"
                              onClick={() => setDeleteId(c.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div className="bottom-note">
                  <Icon name="eye" />
                  <p>
                    References define the question. They are never treated as
                    current observations.
                  </p>
                </div>
              </>
            )}
            {tab === "passes" && (
              <>
                <div className="page-title">
                  <div>
                    <h1>Small permissions.</h1>
                    <p>Every link has a limit. Every answer stays within it.</p>
                  </div>
                  <button
                    className="primary"
                    disabled={!w.cameras.length}
                    onClick={() => {
                      setSelectedCamera("");
                      setView("create-pass");
                    }}
                  >
                    <Icon name="plus" />
                    Create pass
                  </button>
                </div>
                {!w.cameras.length && (
                  <div className="notice">
                    Add a private reference before creating a pass.
                    <button
                      className="text-button"
                      onClick={() => {
                        setTab("references");
                        setView("add-reference");
                      }}
                    >
                      Add reference <Icon name="arrow" />
                    </button>
                  </div>
                )}
                {w.passes.length === 0 ? (
                  <div className="plain-empty">
                    <Icon name="link" size={48} />
                    <h2>No permissions out in the world.</h2>
                    <p>
                      Your first pass will appear here with its expiry,
                      remaining checks and revocation control.
                    </p>
                  </div>
                ) : (
                  <div className="pass-list">
                    {w.passes.map((p) => (
                      <article className="pass-row" key={p.id}>
                        <div className="pass-title">
                          <span className={`status ${p.status}`}>
                            {p.status}
                          </span>
                          <h2>{p.label}</h2>
                          <p>{p.question}</p>
                        </div>
                        <dl>
                          <div>
                            <dt>Checks remaining</dt>
                            <dd>
                              {p.budget - p.used}
                              <span> / {p.budget}</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Expires</dt>
                            <dd className="date-value">{date(p.expires)}</dd>
                          </div>
                        </dl>
                        <Button
                          className="outline"
                          busy={busy === p.id}
                          disabled={!!p.revoked || p.status === "expired"}
                          onClick={async () => {
                            setBusy(p.id);
                            try {
                              await api(`/passes/${p.id}/revoke`, "POST", {});
                              await done(
                                "Pass revoked. Pending and future answers are blocked.",
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy("");
                            }
                          }}
                        >
                          Revoke pass
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
                <div className="bottom-note">
                  <Icon name="lock" />
                  <p>
                    Anyone holding a pass link can use it. You can revoke a link
                    at any time, including while a check is waiting.
                  </p>
                </div>
              </>
            )}
            {tab === "checks" && (
              <>
                <div className="page-title">
                  <div>
                    <h1>A moment of attention.</h1>
                    <p>
                      Review a current observation of the approved area, then release only
                      the finite answer.
                    </p>
                  </div>
                  <span className="status pending">Human approval required</span>
                </div>
                {w.pending.length === 0 ? (
                  <div className="plain-empty">
                    <Icon name="eye" size={50} />
                    <h2>Nothing waiting on your view.</h2>
                    <p>
                      When someone requests a check using your pass, it will
                      appear here. Keep this workspace open while a pass is
                      active.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("passes")}
                    >
                      View shared passes <Icon name="arrow" />
                    </button>
                  </div>
                ) : (
                  <>
                    {w.pending.length > 1 && (
                      <div className="job-tabs">
                        {w.pending.map((j) => (
                          <button
                            className={job?.id === j.id ? "active" : ""}
                            key={j.id}
                            onClick={() => setSelectedJob(j.id)}
                          >
                            {j.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {job && (
                      <RecordCheck
                        key={job.id}
                        job={job}
                        camera={w.cameras.find((c) => c.id === job.camera_id)!}
                        onSave={() =>
                          void done(
                            "Observation recorded. Permission was checked before release.",
                          )
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}
            {tab === "journal" && (
              <>
                <div className="page-title">
                  <div>
                    <h1>A record of permission.</h1>
                    <p>
                      What was requested, what was observed, and what was
                      withheld.
                    </p>
                  </div>
                  <a className="button outline" href="/api/export" download>
                    <Icon name="download" />
                    Export JSON
                  </a>
                </div>
                {w.receipts.length === 0 ? (
                  <div className="plain-empty">
                    <Icon name="receipt" size={50} />
                    <h2>The journal begins with you.</h2>
                    <p>
                      Save a reference or create a pass to start an auditable
                      sequence.
                    </p>
                  </div>
                ) : (
                  <ol className="journal">
                    {w.receipts.map((r) => (
                      <li key={r.id}>
                        <div className="journal-mark">
                          <Icon
                            name={
                              r.action === "pass_revoked"
                                ? "lock"
                                : r.action === "observation_recorded"
                                  ? "eye"
                                  : r.action === "check_requested"
                                    ? "clock"
                                    : "check"
                            }
                          />
                        </div>
                        <div>
                          <h3>
                            {(
                              {
                                reference_created: "Private reference saved",
                                pass_created: "Permission created",
                                check_requested: "Observation requested",
                                observation_recorded:
                                  "Owner observation recorded",
                                pass_revoked: "Permission revoked",
                                release_blocked: "Answer withheld",
                                reference_deleted: "Reference deleted",
                              } as Record<string, string>
                            )[r.action] || r.action}
                          </h3>
                          <p>
                            {typeof r.detail.question === "string"
                              ? r.detail.question
                              : typeof r.detail.result === "string"
                                ? `${r.detail.result.replaceAll("_", " ")} · ${typeof r.detail.observedAt !== "number" ? "Source time unavailable" : r.detail.fresh ? "Fresh at approval" : r.created - r.detail.observedAt > 60000 ? "Too old at approval" : "Freshness not verified"} · ${r.detail.provider === "ring-live-owner-review" ? "Ring live view, reviewed by the owner" : r.detail.provider === "ring-snapshot-owner-review" ? "Ring image, reviewed by the owner" : "Human observation"}`
                                : r.action === "pass_revoked"
                                  ? "Pending and future answers blocked."
                                  : r.action === "check_requested"
                                    ? "Waiting for a human observation."
                                    : "Private workspace record."}
                          </p>
                          {r.action === "observation_recorded" && (
                            <>
                              <small>
                                {typeof r.detail.observedAt === "number" ? `Observed ${date(r.detail.observedAt)}` : "Ring frame capture time unavailable."}
                                {r.detail.provider === "ring-live-owner-review" && ` Owner approved review ${date(r.created)}; this is not the frame’s capture time.`}
                              </small>
                              <PrivateRecord id={String(r.detail.job)} />
                            </>
                          )}
                        </div>
                        <time dateTime={new Date(r.created).toISOString()}>
                          {date(r.created)}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="form-note">
                  Showing the latest 100 events. Images and private evidence
                  never appear in recipient responses.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
type CheckReference = { requestKey: string; jobId?: string };
function readCheckReference(token: string): {
  entry: CheckReference | null;
  available: boolean;
} {
  try {
    const raw = sessionStorage.getItem(`aperture-check:${token}`);
    if (!raw) return { entry: null, available: true };
    try {
      const entry = JSON.parse(raw);
      if (
        typeof entry.requestKey !== "string" ||
        entry.requestKey.length < 8 ||
        entry.requestKey.length > 100 ||
        (entry.jobId !== undefined &&
          (typeof entry.jobId !== "string" ||
            !/^[a-f0-9-]{36}$/.test(entry.jobId)))
      ) {
        sessionStorage.removeItem(`aperture-check:${token}`);
        return { entry: null, available: true };
      }
      // Never restore result content from browser storage, including unexpected fields.
      return {
        entry: {
          requestKey: entry.requestKey,
          ...(entry.jobId ? { jobId: entry.jobId } : {}),
        },
        available: true,
      };
    } catch {
      sessionStorage.removeItem(`aperture-check:${token}`);
      return { entry: null, available: true };
    }
  } catch {
    return { entry: null, available: false };
  }
}
function Recipient({ token }: { token: string }) {
  const [data, setData] = useState<any>(null),
    [job, setJob] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [verified, setVerified] = useState(false),
    [closed, setClosed] = useState(false);
  const [initialRecovery] = useState(() => readCheckReference(token));
  const [storageUnavailable, setStorageUnavailable] = useState(
    !initialRecovery.available,
  );
  const reference = useRef<CheckReference | null>(initialRecovery.entry);
  const generation = useRef(0),
    refreshing = useRef(false),
    requesting = useRef(false),
    denied = useRef(false);
  const lastAttempt = useRef(0);
  const persist = (entry: CheckReference | null) => {
    reference.current = entry;
    try {
      if (entry)
        sessionStorage.setItem(
          `aperture-check:${token}`,
          JSON.stringify(entry),
        );
      else sessionStorage.removeItem(`aperture-check:${token}`);
    } catch {
      setStorageUnavailable(true);
    }
  };
  const closeAccess = (message: string) => {
    // A denial invalidates every older in-flight response before clearing the rendered answer.
    generation.current++;
    denied.current = true;
    persist(null);
    setVerified(false);
    setJob(null);
    setData(null);
    setClosed(true);
    setError(message);
  };
  const failed = (e: unknown) => {
    if (e instanceof ApiError && [401, 403, 404, 410].includes(e.status)) {
      closeAccess(e.message);
    } else {
      // Keep identifiers and the pending state during a temporary network/server failure.
      // Any previously completed answer stays hidden until a fresh authorized read succeeds.
      setVerified(false);
      setError(
        "Connection interrupted. Your check is saved in this tab; we’ll retry automatically.",
      );
    }
  };
  const load = async () => {
    if (refreshing.current || requesting.current || denied.current) return;
    refreshing.current = true;
    lastAttempt.current = Date.now();
    const current = generation.current;
    try {
      const nextData = await api(`/p/${token}`);
      if (current !== generation.current) return;
      if (Date.now() >= nextData.expires) {
        closeAccess("This pass has expired.");
        return;
      }
      const saved = reference.current;
      let nextJob = null;
      if (saved?.jobId) {
        nextJob = await api(`/p/${token}/checks/${saved.jobId}`);
      } else if (saved?.requestKey) {
        // A response may have been lost after the server accepted the request.
        // Reusing its key recovers that check without another budget debit.
        nextJob = await api(`/p/${token}/checks`, "POST", {
          requestKey: saved.requestKey,
        });
      }
      if (current !== generation.current) return;
      if (Date.now() >= nextData.expires) {
        closeAccess("This pass has expired.");
        return;
      }
      if (nextJob && saved)
        persist({ requestKey: saved.requestKey, jobId: nextJob.id });
      setData(nextData);
      setJob(nextJob);
      setVerified(true);
      setClosed(false);
      setError("");
    } catch (e) {
      if (current === generation.current) failed(e);
    } finally {
      refreshing.current = false;
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (
        Date.now() - lastAttempt.current >=
        (reference.current ? 2500 : 10000)
      )
        void load();
    }, 1000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [token]);
  useEffect(() => {
    if (data && now >= data.expires) closeAccess("This pass has expired.");
  }, [now, data?.expires]);
  async function request() {
    if (requesting.current || denied.current) return;
    requesting.current = true;
    setBusy(true);
    setError("");
    const current = ++generation.current;
    const saved =
      !reference.current ||
      job?.state === "complete" ||
      job?.state === "timed_out"
        ? { requestKey: crypto.randomUUID() }
        : reference.current;
    // Write before dispatch so a navigation or a dropped response cannot lose the retry key.
    persist(saved);
    try {
      const j = await api(`/p/${token}/checks`, "POST", {
        requestKey: saved.requestKey,
      });
      if (current !== generation.current) return;
      if (data && Date.now() >= data.expires) {
        closeAccess("This pass has expired.");
        return;
      }
      persist({ requestKey: saved.requestKey, jobId: j.id });
      setJob(j);
      setVerified(true);
    } catch (e) {
      if (current === generation.current) failed(e);
    } finally {
      requesting.current = false;
      setBusy(false);
      void load();
    }
  }
  const expired = !!data && now >= data.expires;
  const wait = data
    ? Math.max(0, Math.ceil((data.cooldownUntil - now) / 1000))
    : 0;
  const resultTitle =
    job?.result === "visible"
      ? "Visible."
      : job?.result === "not_visible"
        ? "Not visible in the approved area."
        : "Cannot verify.";
  return (
    <div className="recipient-page">
      <header className="public-header">
        <Brand />
        <span className="private-label">
          <Icon name="lock" size={16} />A scoped permission
        </span>
      </header>
      <main className="recipient-main">
        <div className="recipient-rule">
          <Icon name="aperture" size={38} />
          <span>
            One question.
            <br />
            Only the approved answer.
          </span>
        </div>
        {!data && !error ? (
          <div className="loading-state">
            <span className="spinner" />
            Opening your pass…
          </div>
        ) : !data || expired ? (
          <section className="unavailable">
            <h1>
              {closed || expired ? (
                <>
                  This permission
                  <br />
                  has closed.
                </>
              ) : (
                <>Connection interrupted.</>
              )}
            </h1>
            <ErrorBox message={error} />
            <p>
              {closed || expired
                ? "No observation is available through this link. Ask the owner for a new pass if you still need a check."
                : "We cannot confirm access right now. Your saved check will be recovered after a successful connection."}
            </p>
            <button
              className="outline"
              onClick={() => {
                denied.current = false;
                void load();
              }}
            >
              Check access again
            </button>
          </section>
        ) : (
          <>
            <h1>{data.question}</h1>
            <p className="recipient-intro">
              The owner makes this check. You receive a timestamped answer; the
              camera view stays private.
            </p>
            <ErrorBox message={error} />
            {storageUnavailable && (
              <p className="form-note" role="status">
                This browser cannot save a check across reloads. Keep this tab
                open while waiting for the owner.
              </p>
            )}
            {job?.state === "pending" ? (
              <section className="answer-panel waiting" role="status">
                <div className="waiting-scan">
                  <Icon name="eye" size={32} />
                </div>
                <h2>Waiting for the owner’s view.</h2>
                <p>
                  Your request is with the owner. Keep this page open; a check
                  can take up to two minutes.
                </p>
                <span>Requested {date(job.requestedAt)}</span>
              </section>
            ) : job?.state === "complete" && verified ? (
              <section
                className={`answer-panel revealed ${job.result}`}
                role="status"
              >
                <Icon
                  name={job.result === "visible" ? "check" : "eye"}
                  size={34}
                />
                <h2>{resultTitle}</h2>
                <p>
                  {job.result === "visible"
                    ? "The owner reported the reference object visible in the approved area."
                    : job.result === "not_visible"
                      ? "The owner reported a clear view of the approved area without the reference object. This does not establish collection or ownership."
                      : job.provider === "ring-live-owner-review" ? "The owner reviewed a Ring live-view frame, but Ring did not supply its capture time. Current visibility could not be verified." : "The owner could not confidently verify the object, or the observation was too old to release a definite answer."}
                </p>
                <span>{job.observedAt ? `Observed ${date(job.observedAt)}` : "Source time unavailable"} · {job.provider === "ring-live-owner-review" ? "Ring live view, reviewed by the owner" : job.provider === "ring-snapshot-owner-review" ? "Ring image, reviewed by the owner" : "Human observation"}</span>
                {job.provider === "ring-live-owner-review" && job.reviewedAt && <span>Owner approved review {date(job.reviewedAt)}. This is not the frame’s capture time.</span>}
                {job.observedAt && now - job.observedAt > 60000 && (
                  <strong className="old-observation">
                    This observation is now more than a minute old.
                  </strong>
                )}
              </section>
            ) : job?.state === "complete" ? (
              <section className="answer-panel" role="status">
                <h2>Reconnecting to your observation.</h2>
                <p>
                  Your answer will appear after the server confirms this pass is
                  still active.
                </p>
              </section>
            ) : job?.state === "timed_out" ? (
              <section className="answer-panel" role="status">
                <h2>The owner did not respond in time.</h2>
                <p>
                  No object information was released. This request used one
                  check.
                </p>
              </section>
            ) : (
              <div className="recipient-explainer">
                <Icon name="eye" size={28} />
                <p>
                  No observation has been requested. A check uses one of this
                  pass’s remaining requests.
                </p>
              </div>
            )}
            <div className="recipient-action">
              <Button
                className="primary"
                busy={busy}
                disabled={
                  !verified ||
                  !data.remaining ||
                  !!wait ||
                  job?.state === "pending"
                }
                onClick={() => void request()}
              >
                {job?.state === "pending"
                  ? "Check requested"
                  : !data.remaining
                    ? "No checks remaining"
                    : wait
                      ? `Next check in ${wait}s`
                      : job
                        ? "Request another check"
                        : "Request a check"}
                <Icon name="arrow" />
              </Button>
              <span>
                {data.remaining} {data.remaining === 1 ? "check" : "checks"}{" "}
                remaining
              </span>
            </div>
            <dl className="permission-details">
              <div>
                <dt>Access ends</dt>
                <dd>{date(data.expires)}</dd>
              </div>
              <div>
                <dt>Observation provider</dt>
                <dd>{(job?.provider || data.provider) === "ring-live-owner-review" ? "Ring live view, reviewed by the owner" : (job?.provider || data.provider) === "ring-snapshot-owner-review" ? "Ring image, reviewed by the owner" : "The owner, manually"}</dd>
              </div>
              <div>
                <dt>What is shared</dt>
                <dd>Only this answer and its time</dd>
              </div>
            </dl>
            <div className="recipient-note">
              <Icon name="link" />
              <p>
                Anyone holding this link can use it. The owner can revoke access
                at any time. This page does not provide footage, identity,
                condition or collection confirmation.
              </p>
            </div>
          </>
        )}
      </main>
      <footer className="recipient-footer">
        Aperture <span>Permission before observation.</span>
      </footer>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [auth, setAuth] = useState(false);
  const token = location.pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/)?.[1];
  useEffect(() => {
    if (token) {
      setLoading(false);
      return;
    }
    api("/me")
      .then((x) => setUser(x.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (token) return <Recipient token={token} />;
  if (loading)
    return (
      <div className="boot">
        <Brand />
        <span className="spinner" />
      </div>
    );
  return user ? (
    <Owner
      user={user}
      onLogout={() => {
        setUser(null);
        setAuth(false);
      }}
    />
  ) : auth ? (
    <Auth onSuccess={setUser} onBack={() => setAuth(false)} />
  ) : (
    <Landing onAuth={() => setAuth(true)} />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
