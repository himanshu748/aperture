import * as THREE from "three";

export type CutawayView = "reference" | "scope" | "answer";
export type CutawayController = { setView: (view: CutawayView) => void; dispose: () => void };

/** Procedural permission model only. This module never accepts photos, tokens, or account data. */
export function createPrivacyScene(host: HTMLElement, initial: CutawayView, onReady: (ready: boolean) => void): CutawayController {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "privacy-webgl";
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch { host.dataset.renderFailure = "WebGL initialization unavailable"; onReady(false); return { setView() {}, dispose() {} }; }
  host.append(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  const lookAt = new THREE.Vector3(0, 0, 0);
  const roughMetal = new THREE.MeshStandardMaterial({ color: 0x798070, metalness: 0.78, roughness: 0.38 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x252c26, metalness: 0.22, roughness: 0.64 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe7e0d0, roughness: 0.82 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xad4931, metalness: 0.5, roughness: 0.36 });
  const warmInk = new THREE.MeshStandardMaterial({ color: 0x9e402b, roughness: 0.64 });
  const neutral = new THREE.MeshStandardMaterial({ color: 0x56634f, roughness: 0.84 });
  const bright = new THREE.MeshStandardMaterial({ color: 0xd4cbbc, metalness: 0.2, roughness: 0.6 });

  scene.add(new THREE.HemisphereLight(0xe9eedf, 0x29221b, 2.2));
  const key = new THREE.DirectionalLight(0xffe2c2, 4.5);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
  key.shadow.radius = 3;
  key.shadow.normalBias = 0.04;
  key.shadow.bias = -0.0001;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9c8b6, 2.3); fill.position.set(6, 2, -3); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x0b120c, opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.83; floor.receiveShadow = true; scene.add(floor);

  const model = new THREE.Group(); scene.add(model);
  const reference = new THREE.Group(), scope = new THREE.Group(), answer = new THREE.Group();
  model.add(reference, scope, answer);
  function box(parent: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function ring(parent: THREE.Group, radius: number, tube: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 80), material);
    mesh.position.z = z; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function label(parent: THREE.Group, text: string, x: number, y: number, z: number, width: number, color: string) {
    const bitmap = document.createElement("canvas"); bitmap.width = 512; bitmap.height = 64;
    const ctx = bitmap.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = color; ctx.font = "500 28px sans-serif"; ctx.textBaseline = "middle"; ctx.fillText(text, 0, 32);
    const texture = new THREE.CanvasTexture(bitmap); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.set(x, y, z); parent.add(mesh);
  }
  // A private contact sheet: deliberately abstract, never a reconstructed camera view.
  box(reference, 0, 0, 0, 3.05, 2.75, 0.13, ink);
  box(reference, 0, 1.39, 0, 3.16, 0.045, 0.19, roughMetal);
  box(reference, 0, -1.39, 0, 3.16, 0.045, 0.19, roughMetal);
  box(reference, -1.56, 0, 0, 0.045, 2.8, 0.19, roughMetal);
  box(reference, 1.56, 0, 0, 0.045, 2.8, 0.19, roughMetal);
  label(reference, "REFERENCE / PRIVATE", 0, 1.13, 0.081, 2.65, "#dedacd");
  box(reference, -0.68, 0.06, 0.10, 1.23, 1.46, 0.04, neutral);
  box(reference, 0.52, 0.41, 0.10, 0.94, 0.76, 0.04, neutral);
  box(reference, 0.62, -0.42, 0.10, 1.16, 0.53, 0.04, neutral);
  box(reference, -0.13, -0.08, 0.16, 0.51, 0.68, 0.13, warmInk);
  box(reference, -0.13, 0.04, 0.235, 0.52, 0.018, 0.006, bright);
  // Bounded object outline is intentionally different from the full reference.
  const bounds = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.84, 1.04));
  const outline = new THREE.LineSegments(bounds, new THREE.LineBasicMaterial({ color: 0xe4a082 }));
  outline.position.set(-0.13, -0.08, 0.246); reference.add(outline);
  label(reference, "THE FULL VIEW STAYS HERE", 0, -1.16, 0.081, 2.65, "#aab49f");
  box(reference, 0, -1.56, -0.05, 1.58, 0.27, 0.7, ink);

  // A physical lens cutaway makes the permission boundary tangible.
  ring(scope, 1.21, 0.115, 0, roughMetal);
  ring(scope, 1.21, 0.10, -0.21, ink);
  ring(scope, 1.39, 0.035, 0.015, copper);
  ring(scope, 1.12, 0.026, 0.04, bright);
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.075, 0.16), roughMetal, 48);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 48; i++) { const angle = i / 48 * Math.PI * 2; dummy.position.set(Math.cos(angle) * 1.39, Math.sin(angle) * 1.39, 0); dummy.rotation.z = angle - Math.PI / 2; dummy.updateMatrix(); teeth.setMatrixAt(i, dummy.matrix); }
  teeth.castShadow = true; scope.add(teeth);
  const iris = new THREE.Group(); scope.add(iris);
  const blades: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const shape = new THREE.Shape(); shape.moveTo(0.45, -0.22); shape.lineTo(1.09, -0.33); shape.quadraticCurveTo(1.33, 0.45, 0.88, 0.67); shape.lineTo(0.30, 0.31); shape.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, steps: 1, curveSegments: 10 }), i % 2 ? ink : roughMetal);
    blade.rotation.z = i * Math.PI / 3; blade.position.z = 0.06 + i * 0.007; blade.castShadow = true; blade.receiveShadow = true; iris.add(blade); blades.push(blade);
  }
  box(scope, 0, -1.54, -0.1, 0.34, 0.24, 0.26, roughMetal);
  box(scope, 0, -1.72, -0.1, 1.42, 0.12, 0.78, ink);

  // The answer is a finite paper receipt, separated from image-bearing layers.
  box(answer, 0, 0, 0, 1.66, 2.05, 0.045, paper);
  box(answer, -0.52, 0.81, 0.03, 0.20, 0.04, 0.01, copper);
  label(answer, "ANSWER", 0.03, 0.60, 0.026, 1.33, "#545e4d");
  const check1 = box(answer, -0.14, 0.08, 0.04, 0.085, 0.37, 0.025, warmInk); check1.rotation.z = 0.76;
  const check2 = box(answer, 0.13, 0.17, 0.04, 0.085, 0.63, 0.025, warmInk); check2.rotation.z = -0.70;
  label(answer, "FINITE RESULT", 0.03, -0.43, 0.026, 1.33, "#545e4d");
  box(answer, 0, -0.64, 0.03, 1.18, 0.013, 0.005, neutral);
  label(answer, "+ OBSERVATION TIME", 0.03, -0.78, 0.026, 1.33, "#545e4d");
  box(answer, 0, -1.43, -0.10, 0.18, 0.79, 0.19, roughMetal);
  box(answer, 0, -1.76, -0.1, 1.05, 0.07, 0.72, ink);

  const states: Record<CutawayView, { camera: [number, number, number]; target: [number, number, number]; spread: number; rotation: number; aperture: number }> = {
    reference: { camera: [-6.3, 3.1, 7.8], target: [-0.40, -0.12, -0.35], spread: 2.12, rotation: -0.07, aperture: -0.09 },
    scope: { camera: [-7.4, 3.5, 8.5], target: [0, -0.08, 0], spread: 2.04, rotation: 0, aperture: 0.13 },
    answer: { camera: [-4.7, 2.5, 8.4], target: [0.48, -0.13, 0.47], spread: 2.00, rotation: 0.18, aperture: 0.24 },
  };
  let view = initial, raf = 0, disposed = false, lost = false, inView = true, frames = 0;
  let progress = 1, startTime = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fromCamera = new THREE.Vector3(), fromTarget = new THREE.Vector3();
  let fromSpread = states[initial].spread, fromRotation = states[initial].rotation, fromAperture = states[initial].aperture;
  let spread = fromSpread, rotation = fromRotation, aperture = fromAperture;
  const destination = () => states[view];
  function apply(t: number) {
    const dest = destination(); const eased = 1 - Math.pow(1 - t, 4);
    camera.position.lerpVectors(fromCamera, new THREE.Vector3(...dest.camera), eased);
    lookAt.lerpVectors(fromTarget, new THREE.Vector3(...dest.target), eased); camera.lookAt(lookAt);
    spread = THREE.MathUtils.lerp(fromSpread, dest.spread, eased);
    rotation = THREE.MathUtils.lerp(fromRotation, dest.rotation, eased);
    aperture = THREE.MathUtils.lerp(fromAperture, dest.aperture, eased);
    reference.position.set(-0.27, 0.14, -spread);
    answer.position.set(0.35, -0.15, spread);
    model.rotation.y = rotation;
    blades.forEach((blade, index) => { blade.rotation.z = index * Math.PI / 3 + aperture; });
  }
  function render() {
    if (disposed || lost || !inView || document.hidden) return;
    const before = performance.now();
    renderer.render(scene, camera);
    host.dataset.frames = String(++frames);
    host.dataset.drawCalls = String(renderer.info.render.calls);
    host.dataset.triangles = String(renderer.info.render.triangles);
    host.dataset.renderMs = (performance.now() - before).toFixed(2);
    host.dataset.pixelRatio = String(renderer.getPixelRatio());
  }
  function tick(time: number) {
    raf = 0;
    if (disposed || lost || !inView || document.hidden) return;
    if (!startTime) startTime = time;
    progress = motion.matches ? 1 : Math.min(1, (time - startTime) / 720);
    apply(progress); render();
    if (progress < 1) raf = requestAnimationFrame(tick);
  }
  function resume() {
    cancelAnimationFrame(raf); raf = 0;
    if (disposed || lost || !inView || document.hidden) return;
    // Resume at the selected state, without replaying animation missed offscreen.
    progress = 1; apply(1); render();
  }
  function resize() {
    if (disposed || lost) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.fov = width < 430 ? 42 : 34; camera.updateProjectionMatrix(); render();
  }
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else resume(); };
  const reduce = () => { if (motion.matches) resume(); };
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; host.dataset.renderFailure = "WebGL context lost"; cancelAnimationFrame(raf); raf = 0; onReady(false); };
  canvas.addEventListener("webglcontextlost", contextLost);
  document.addEventListener("visibilitychange", visibility); motion.addEventListener("change", reduce);
  const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (!inView) { cancelAnimationFrame(raf); raf = 0; } else resume(); });
  observer.observe(host);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  fromCamera.set(...states[initial].camera); fromTarget.set(...states[initial].target); apply(1); resize(); onReady(true);
  return {
    setView(next) {
      if (disposed || lost || next === view) return;
      fromCamera.copy(camera.position); fromTarget.copy(lookAt);
      fromSpread = spread; fromRotation = rotation; fromAperture = aperture;
      view = next; progress = 0; startTime = 0;
      cancelAnimationFrame(raf); raf = 0;
      if (motion.matches || !inView || document.hidden) { apply(1); render(); } else raf = requestAnimationFrame(tick);
    },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf);
      observer.disconnect(); resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibility); motion.removeEventListener("change", reduce);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
            materials.add(material);
            Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
          });
        }
      });
      geometries.forEach(resource => resource.dispose()); materials.forEach(resource => resource.dispose()); textures.forEach(resource => resource.dispose());
      key.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
