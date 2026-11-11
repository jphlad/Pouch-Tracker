// Pull-down tin animation. Flat-shaded low-poly 3D, built with Three.js.
// Built into js/tin.js with: npx esbuild src/tin.src.js --bundle --minify --format=esm --outfile=js/tin.js
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, CylinderGeometry, CapsuleGeometry, TorusGeometry,
  MeshLambertMaterial, MeshBasicMaterial, AmbientLight, DirectionalLight, CanvasTexture, SRGBColorSpace, MathUtils, Vector3,
} from 'three';

const COLORS = {
  tin: 0x2a6646,
  tinDark: 0x1c4a32,
  lid: 0xeee6d3,
  lidRim: 0xd9ceb5,
  pouch: 0xeee6d3,
  pouchAlt: 0xe2d8c1,
};

const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

function lidTexture() {
  // Flat cream lid with the app's sideways-pouch outline embossed in forest green.
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#EEE6D3'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#D9CEB5'; g.lineWidth = 18;
  g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#2A6646'; g.lineWidth = 22;
  const w = 250, h = 124, r = 50, x = 256 - w / 2, y = 256 - h / 2;
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath(); g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createTin() {
  const canvas = document.createElement('canvas');
  canvas.className = 'tin-canvas';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '30',
    pointerEvents: 'none', opacity: '0', transition: 'opacity .25s ease',
  });
  document.body.appendChild(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  scene.add(new AmbientLight(0xffffff, 1.55));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 8);
  scene.add(sun);

  // ---- Tin ----
  const tin = new Group();
  const SEG = 14; // low-poly
  const body = new Mesh(new CylinderGeometry(1.6, 1.6, 0.62, SEG, 1, true), new MeshLambertMaterial({ color: COLORS.tin, flatShading: true }));
  const floor = new Mesh(new CylinderGeometry(1.6, 1.6, 0.04, SEG), new MeshLambertMaterial({ color: COLORS.tinDark, flatShading: true }));
  floor.position.y = -0.29;
  const inner = new Mesh(new CylinderGeometry(1.55, 1.55, 0.6, SEG, 1, true), new MeshLambertMaterial({ color: COLORS.tinDark, flatShading: true, side: 1 }));
  tin.add(body, floor, inner);

  // pouches resting inside the tin (visible once the lid is off)
  // pouch: a soft flat pillow, long along x, wide along z, thin along y
  const pouchGeo = new CapsuleGeometry(0.26, 0.5, 3, 10);
  pouchGeo.scale(1, 1, 0.34);
  pouchGeo.rotateZ(Math.PI / 2);
  pouchGeo.rotateX(Math.PI / 2);
  const pouchMats = [
    new MeshLambertMaterial({ color: COLORS.pouch, flatShading: true }),
    new MeshLambertMaterial({ color: COLORS.pouchAlt, flatShading: true }),
  ];
  const makePouch = (i) => {
    return new Mesh(pouchGeo, pouchMats[i % 2]);
  };

  const resting = new Group();
  // rows of pouches lying flat, like a freshly opened can
  const rows = [[-0.9, 2], [-0.45, 3], [0, 3], [0.45, 3], [0.9, 2]];
  let k = 0;
  for (const [z, n] of rows) {
    for (let j = 0; j < n; j++) {
      const m = makePouch(k++);
      m.position.set((j - (n - 1) / 2) * 1.02, -0.2, z);
      m.rotation.y = (Math.random() - 0.5) * 0.12;
      resting.add(m);
    }
  }
  tin.add(resting);

  // ---- Lid ----
  const lid = new Group();
  const lidMats = [
    new MeshLambertMaterial({ color: COLORS.lidRim, flatShading: true }), // side
    new MeshBasicMaterial({ map: lidTexture() }), // top: flat, no shading
    new MeshLambertMaterial({ color: COLORS.lidRim, flatShading: true }), // bottom
  ];
  const lidMesh = new Mesh(new CylinderGeometry(1.68, 1.68, 0.24, SEG), lidMats);
  lid.add(lidMesh);
  lid.position.y = 0.38;
  tin.add(lid);

  const root = new Group();
  root.add(tin);
  scene.add(root);

  let W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // Convert a screen-space y (px from top) to world y on the z=0 plane.
  const worldYForScreen = (py) => {
    const vh = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return (0.5 - py / H) * vh;
  };

  let pull = 0;
  let mode = 'idle'; // idle | pulling | bursting | retracting
  let raf = 0;
  let flying = [];
  let burstT = 0;
  let lastTs = 0;
  let resolveDone = null;
  let lidVel = null;
  let tinVel = 0;

  function poseForPull(p) {
    const k = Math.min(p, 1.15);
    // starts flat: lid facing the camera
    tin.rotation.x = MathUtils.lerp(Math.PI / 2, Math.PI / 2 - 1.05, ease.outCubic(Math.min(k, 1)));
    // spins up to an angle as you pull
    root.rotation.z = MathUtils.lerp(0, -0.42, ease.outCubic(Math.min(k, 1)));
    tin.rotation.y = k * Math.PI * 0.9;
    const s = MathUtils.lerp(0.4, 0.82, ease.outBack(Math.min(k, 1)));
    root.scale.setScalar(s);
    // hang just below the top of the screen, following the finger
    root.position.y = worldYForScreen(70 + Math.min(p, 1.2) * 150);
    // lid strains past the threshold
    lid.position.y = 0.38 + Math.max(0, k - 0.9) * 0.6;
    lid.rotation.z = Math.max(0, k - 0.9) * 0.5 * Math.sin(performance.now() / 40);
  }

  function frame(ts) {
    const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
    lastTs = ts;

    if (mode === 'pulling') {
      poseForPull(pull);
    } else if (mode === 'retracting') {
      pull = Math.max(0, pull - dt * 4);
      poseForPull(pull);
      if (pull <= 0) finish();
    } else if (mode === 'bursting') {
      const slow = 0.45; // slow motion
      const G = 9;
      const sdt = dt * slow;
      burstT += dt;
      // lid flies off, tumbling
      lidVel.y -= G * sdt;
      lid.position.x += lidVel.x * sdt; lid.position.y += lidVel.y * sdt; lid.position.z += lidVel.z * sdt;
      lid.rotation.x += 2.6 * sdt; lid.rotation.z += 1.4 * sdt;
      // tin kicks back, then drops away with a lazy spin
      tin.rotation.y += 0.7 * sdt;
      tinVel -= G * sdt * (burstT > 0.5 ? 1 : 0.15);
      root.position.y += tinVel * sdt;
      root.rotation.z -= 0.25 * sdt;
      for (const f of flying) {
        if (burstT < f.delay) continue;
        if (!f.released) {
          f.released = true;
          if (f.hide) f.hide.visible = false;
          // move from tin-local resting spot into root space
          f.mesh.position.copy(f.start);
          root.add(f.mesh);
        }
        f.vel.y -= G * sdt;
        f.mesh.position.addScaledVector(f.vel, sdt);
        f.mesh.rotation.x += f.spin.x * sdt;
        f.mesh.rotation.y += f.spin.y * sdt;
        f.mesh.rotation.z += f.spin.z * sdt;
      }
      if (burstT > 3.0) canvas.style.opacity = String(Math.max(0, 1 - (burstT - 3.0) / 0.6));
      if (burstT > 3.65) finish();
    }

    renderer.render(scene, camera);
    if (mode !== 'idle') raf = requestAnimationFrame(frame);
  }

  function start() {
    if (mode === 'idle') {
      canvas.style.transition = 'opacity .2s ease';
      canvas.style.opacity = '1';
      lastTs = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function reset() {
    resting.children.forEach((c) => { c.visible = true; });
    tinVel = 0;
    for (const f of flying) root.remove(f.mesh);
    flying = [];
    if (lid.parent !== tin) { lid.parent?.remove(lid); tin.add(lid); }
    lid.position.set(0, 0.38, 0); lid.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    tin.rotation.set(Math.PI / 2, 0, 0);
    burstT = 0;
  }

  function finish() {
    mode = 'idle';
    cancelAnimationFrame(raf);
    canvas.style.opacity = '0';
    setTimeout(() => { if (mode === 'idle') reset(); }, 260);
    if (resolveDone) { const r = resolveDone; resolveDone = null; r(); }
  }

  function burst() {
    mode = 'bursting';
    burstT = 0;
    // lid launches up and toward the camera-left
    lidVel = { x: -1.8, y: 5.8, z: 1.1 };
    tinVel = 1.2;
    scene.updateMatrixWorld(true);
    // lid flies in root space so it isn't tied to the tin's spin
    const lw = lid.getWorldPosition(new Vector3());
    tin.remove(lid); root.add(lid); lid.position.copy(root.worldToLocal(lw));
    lid.rotation.set(tin.rotation.x, 0, 0);
    const N = 16;
    for (let i = 0; i < N; i++) {
      const m = makePouch(i);
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.4 + Math.random() * 0.9;
      // start position: at the tin mouth, converted into root space
      const local = { x: Math.cos(a) * r * 0.8, y: 0.2, z: Math.sin(a) * r * 0.8 };
      const start = root.worldToLocal(tin.localToWorld(new Vector3(local.x, local.y, local.z)));
      const out = tin.localToWorld(new Vector3(local.x * 1.6, 1.8, local.z * 1.6));
      const outLocal = root.worldToLocal(out).sub(start).normalize();
      const speed = 0.8 + Math.random() * 1.0;
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      flying.push({
        mesh: m,
        start,
        delay: 0.04 + i * 0.035 + Math.random() * 0.05,
        vel: outLocal.multiplyScalar(speed).add({ x: (Math.random() - 0.5) * 4.2, y: 4.0 + Math.random() * 2.4, z: 0.6 + Math.random() * 2.2 }),
        spin: { x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 9, z: (Math.random() - 0.5) * 9 },
        released: false,
        hide: resting.children[i] || null,
      });
    }
  }

  return {
    /** p: 0 → 1 is the threshold, can exceed 1 slightly. */
    setPull(p) {
      if (mode === 'bursting') return;
      pull = Math.max(0, p);
      if (mode === 'idle') { reset(); start(); }
      mode = 'pulling';
    },
    /** Returns a promise that resolves when the animation is finished. */
    release({ reducedMotion = false } = {}) {
      if (mode !== 'pulling') return Promise.resolve(false);
      const triggered = pull >= 1;
      return new Promise((resolve) => {
        resolveDone = () => resolve(triggered);
        if (triggered && !reducedMotion) burst();
        else mode = 'retracting';
      });
    },
    get active() { return mode !== 'idle'; },
    get debug() { return { mode, pull, burstT, flying: flying.length }; },
  };
}
