import { useEffect, useRef, useState } from "react";
import type { CutawayController, CutawayView } from "./privacy-scene";

const views = [
  { id: "reference", label: "Private reference", title: "The reference stays with you.", description: "The owner keeps the whole image and its context. A pass never grants access to this view.", detail: "Photo and private notes · Owner only" },
  { id: "scope", label: "Permitted scope", title: "A permission with an edge.", description: "One named object, in one approved area. The pass also limits when and how often someone may ask.", detail: "One object · One area · Limited checks" },
  { id: "answer", label: "Finite answer", title: "One fact crosses the boundary.", description: "The recipient receives an approved outcome and observation time. The surrounding image stays private.", detail: "Visible · Not visible in the area · Cannot verify" },
] as const;

function StaticCutaway({ view }: { view: CutawayView }) {
  return <svg className="privacy-static" viewBox="0 0 520 340" aria-hidden="true">
    <g fill="none" stroke="#8a9281" strokeWidth="1.5">
      <path d="M70 265H450M123 120H406" strokeDasharray="3 8" opacity=".5" />
      <rect x="68" y="74" width="165" height="192" rx="2" fill="#343b33" stroke={view === "reference" ? "#f2e9d9" : "#8a9281"} />
      <path d="M85 94H146M85 104H125M85 224H200M85 237H158" />
      <rect x="102" y="131" width="54" height="65" stroke="#d87455" />
      <path d="M112 143H146V185H112Z" fill="#a43724" stroke="none" />
      <circle cx="270" cy="170" r="91" fill="#252b26" stroke={view === "scope" ? "#f2e9d9" : "#8a9281"} />
      <circle cx="270" cy="170" r="73" stroke="#d87455" />
      <path d="m240 142 43-11 26 35-17 37-45 3-21-39Z" fill="#343b33" stroke="#929789" />
      <path d="M263 151H285V187H263Z" fill="#a43724" stroke="none" />
      <rect x="352" y="117" width="113" height="130" fill="#eae6de" stroke={view === "answer" ? "#d87455" : "#8a9281"} />
      <path d="m391 160 12 12 22-25" stroke="#a43724" strokeWidth="3" />
      <path d="M372 204H445M386 215H430" stroke="#777d70" />
    </g>
  </svg>;
}

export function PrivacyCutaway() {
  const [view, setView] = useState<CutawayView>("scope");
  const [renderer, setRenderer] = useState<"loading" | "webgl" | "static">("loading");
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CutawayController | null>(null);
  const currentView = useRef(view);
  currentView.current = view;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, started = false;
    const start = async () => {
      if (started || disposed) return;
      started = true;
      try {
        const { createPrivacyScene } = await import("./privacy-scene");
        if (disposed) return;
        controller.current = createPrivacyScene(element, currentView.current, (ready) => {
          if (!disposed) setRenderer(ready ? "webgl" : "static");
        });
      } catch (error) {
        if (!disposed) {
          element.dataset.renderFailure = error instanceof Error ? error.message : "The 3D view could not load.";
          setRenderer("static");
        }
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { void start(); observer.disconnect(); }
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); controller.current?.dispose(); controller.current = null; };
  }, [attempt]);
  useEffect(() => { controller.current?.setView(view); }, [view]);
  const selected = views.find(item => item.id === view)!;
  return <figure className="privacy-cutaway" aria-label="Interactive permission demonstration">
    <div className="privacy-stage" ref={host} data-renderer={renderer} data-view={view}>
      <StaticCutaway view={view} />
      <div className="privacy-stage-caption"><span>Permission, in three layers</span><span>{renderer === "static" ? "Static illustration" : "Illustrative cutaway"}</span></div>
    </div>
    <div className="privacy-switcher" role="group" aria-label="Explore the permission layers">
      {views.map((item, index) => <button key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)} aria-controls="privacy-explanation">
        <span className="privacy-step" aria-hidden="true">{index + 1}</span>{item.label}
      </button>)}
    </div>
    <figcaption id="privacy-explanation" className="privacy-explanation" aria-live="polite" aria-atomic="true">
      <h2>{selected.title}</h2>
      <p>{selected.description}</p>
      <span className="privacy-detail">{selected.detail}</span>
    </figcaption>
    <div className="privacy-illustration-note">
      <span>Illustration of permissions. No camera feed or image analysis.</span>
      {renderer === "static" && <button className="privacy-retry" onClick={() => { setRenderer("loading"); setAttempt(value => value + 1); }}>Try 3D view</button>}
    </div>
  </figure>;
}
