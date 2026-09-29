# Aperture visual system

Direction: photographic archive reading room. An object, its bounded field, and the permission to ask about it. Source material is the owner's own photograph; empty workspaces use a truthful typographic and geometric field, never pretend camera imagery.

The requested photographic/editorial direction constrains the concept roll. Grounded candidates considered: contact sheet, dispatch docket, gallery wall label, darkroom workbench, property collection receipt, archive reading room (assigned), and outdoor wayfinding. The reading room wins on a calm permission workflow. Terminal and tube-counter challengers lose task clarity; retain explicit state acknowledgment and tabular timing. Grid specimen contributes precise region measurement. Theater and alphabet challengers lose operator clarity; retain intentional whitespace and one controlled transition.

Bone #eae6de surfaces, near-black #242722 ink, warm white paper #f7f4ed and vermilion #a43724 for primary actions. Newsreader headings and DM Sans controls, self-hosted OFL fonts. Image review canvas is charcoal, photographs untinted. Hairlines organize pages; no nested dashboard cards. A left rail belongs to owner operation, a single editorial column to recipients. Generous heading space, dense practical form groups. 720px collapses the rail to horizontal navigation and review columns to a sequence. One reveal of recipient answer with restrained clip-path and translation; reduced-motion removes it. Keyboard focus is visible in vermilion. Controls have real busy, empty and error states.

Scope mode: owner /app Operate; public entry Persuade; /p/:token Operate. The same archive grammar reaches pass lists, scoped reference review, private evidence and receipts.

## Interactive permission cutaway — September 2026

The public landing page adds one purposeful 3D interaction in the photographic darkroom world: a private contact sheet, a machined aperture and a finite paper receipt. These are original procedural geometry, explicitly labeled as an illustration of permissions. They do not reconstruct a location, display a customer image or imply a connected camera. Owner and recipient operation retain their existing interfaces.

The focal motion is selection of a permission layer. The view moves between reference, scope and answer, and the aperture responds to the narrower disclosure. Native buttons expose the same three states, with visible pressed/focus states and a live DOM explanation. No hovering, cursor tracking or ambient rotation distracts from the explanation.

Three.js loads only when the landing illustration approaches the viewport. Geometry uses PBR materials, a warm key and cooler fill, and no network assets. Rendering stops when a transition settles, when offscreen, and when the document is hidden. Reduced motion renders the selected state directly. DPR is capped at 1.5. Resize, event listeners, geometry, materials, textures and the renderer have explicit teardown. A geometric SVG and all DOM controls remain usable while loading, without WebGL, or after context loss; a failed renderer can be retried.

The initial production lazy scene chunk is about 142 KB gzip, separate from the application entry. Browser results and the final measured primitive/frame counts are recorded in `.impeccable/review/3d-results-r2.json`; these are local Chromium measurements, not physical-phone performance claims.

Final bounded verification: desktop 1440px and touch 390px captures passed with keyboard, reduced-motion, missing-WebGL and actual context-loss paths. The local headless Chromium scene reported 69 draw calls and 13,084 triangles (renderer counters include render passes), with no frames rendered after idle settling. A 1-second transition sample measured 33.2ms median and 50ms p95 rAF intervals on the shared machine; no 60fps, hardware-GPU or physical-phone claim is made. Full results are in the JSON artifact above.

## Ring source operation — September 12

The owner workspace adds a source-connection surface using the existing reading-room controls, type and color. Source setup, private reference preparation and per-check evidence follow the real workflow. A password input clears tokens after each attempt; explicit connected, disconnected, empty-device and missing-media states replace decorative provider indicators. Camera-module selection comes from discovery. Ring capture time is read-only and distinct from download time. The recipient labels human review and never renders imagery. The existing 3D illustration is unchanged.
# September 12 verification

The Ring source surface passed an inspected desktop/mobile browser workflow at 1440px and 390px with reduced motion enabled. Connection, missing-media recovery, reference import, source-timestamp approval, recipient image exclusion and disconnect cleanup are covered in `.impeccable/review/ring-browser-results.json`. These are explicitly synthetic contract fixtures. All seven existing recipient recovery cases also passed. The UI detector's completed artifact contains `[]`; no second visual correction round was needed. No actual Ring device or official simulator was accessed. See `.impeccable/review/ring-verification.md` for the full evidence boundary.
