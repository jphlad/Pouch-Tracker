// Pull-down tin. Flat 2D, on a layer behind the page.
// The tin stands upright (like a coin on its edge) and spins as you pull.
// It sits tucked behind the page until you've pulled far enough to reveal it,
// and lands with the lid facing you at full reach.

const C = {
  stage: '#0B2416',
  shadow: '#071A10',
  lidFace: '#EEE6D3',
  lidRing: '#D9CEB6',
  lidSide: '#D2C6AB',
  mark: '#2A6646',
  body: '#24583C',
  bodyDark: '#1A4430',
  bottom: '#1E4D34',
  bottomRing: '#2A6646',
  edge: '#0E2A1B',
};

const R = 64;        // tin radius (px)
const LID_T = 12;    // lid thickness
const BODY_T = 26;   // body thickness
const TOTAL_T = LID_T + BODY_T;
const W = 220, H = 170; // svg box
const CX = W / 2, CY = 74;

const css = `
.tin-stage {
  position: fixed; left: 0; right: 0; top: 0; height: 360px; z-index: 0; overflow: hidden;
  visibility: hidden; pointer-events: none; background: ${C.stage};
}
.tin-stage.on { visibility: visible; }
.tin-svg { position: absolute; left: 50%; margin-left: -${W / 2}px; width: ${W}px; height: ${H}px; }
`;

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export function createTin(page) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const stage = document.createElement('div');
  stage.className = 'tin-stage';
  const svg = el('svg', { class: 'tin-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  stage.appendChild(svg);
  document.body.insertBefore(stage, document.body.firstChild);

  const shadow = el('ellipse', { cx: CX, cy: CY + R + 18, rx: 52, ry: 7, fill: C.shadow });
  const g = el('g');
  svg.append(shadow, g);

  // Face art lives in a group squashed horizontally as the tin turns.
  function lidFace(cx, sx) {
    const f = el('g', { transform: `translate(${cx} ${CY}) scale(${sx} 1)` });
    f.append(
      el('circle', { r: R, fill: C.lidFace }),
      el('circle', { r: R * 0.84, fill: 'none', stroke: C.lidRing, 'stroke-width': 4 }),
      el('rect', { x: -R * 0.5, y: -R * 0.25, width: R, height: R * 0.5, rx: R * 0.21, fill: 'none', stroke: C.mark, 'stroke-width': 7 }),
    );
    return f;
  }
  function bottomFace(cx, sx) {
    const f = el('g', { transform: `translate(${cx} ${CY}) scale(${sx} 1)` });
    f.append(
      el('circle', { r: R - 2, fill: C.bottom }),
      el('circle', { r: R * 0.7, fill: 'none', stroke: C.bottomRing, 'stroke-width': 4 }),
    );
    return f;
  }
  const band = (x1, x2, r, fill) => el('rect', {
    x: Math.min(x1, x2), y: CY - r, width: Math.max(0.01, Math.abs(x2 - x1)), height: r * 2, fill,
  });
  const cap = (cx, sx, r, fill) => el('ellipse', { cx, cy: CY, rx: Math.max(0.01, r * Math.abs(sx)), ry: r, fill });

  // theta = rotation about the vertical axis. 0 = lid facing you.
  function draw(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const xFront = CX + (TOTAL_T / 2) * s;           // lid face
    const xLidIn = CX + (TOTAL_T / 2 - LID_T) * s;   // where lid meets body
    const xBack = CX - (TOTAL_T / 2) * s;            // bottom face
    g.replaceChildren();
    if (c >= 0) {
      g.append(
        cap(xBack, c, R - 2, C.bodyDark),
        band(xBack, xLidIn, R - 2, C.body),
        cap(xLidIn, c, R, C.lidSide),
        band(xLidIn, xFront, R, C.lidSide),
        lidFace(xFront, Math.max(c, 0.001)),
      );
    } else {
      g.append(
        cap(xFront, c, R, C.lidSide),
        band(xFront, xLidIn, R, C.lidSide),
        cap(xLidIn, c, R - 2, C.bodyDark),
        band(xLidIn, xBack, R - 2, C.body),
        bottomFace(xBack, Math.max(-c, 0.001)),
      );
    }
    shadow.setAttribute('rx', String(30 + 26 * Math.abs(c) + 8 * Math.abs(s)));
  }

  // ---- gesture state ----
  const MAX_D = 250;   // how far the page slides down at full reach
  const SPINS = 2.25;  // turns completed on the way to full reach
  const TIN_TOP = 40;  // tin position on the stage (px from top); fully clear of the page at full reach
  svg.style.top = `${TIN_TOP}px`;
  let d = 0, mode = 'idle', raf = 0, done = null;

  const easeOut = (t) => 1 - Math.pow(1 - t, 2.2);
  const progress = () => Math.min(1, d / MAX_D);

  function layout() {
    page.style.transform = `translateY(${d}px)`;
    draw((1 - easeOut(progress())) * SPINS * Math.PI * 2); // ends at 0 = lid facing forward
  }

  function loop() {
    if (mode === 'retract') {
      d = Math.max(0, d - Math.max(12, d * 0.18));
      layout();
      if (d <= 0) return finish();
    } else if (mode === 'pulling') {
      layout();
    }
    raf = requestAnimationFrame(loop);
  }

  function finish() {
    cancelAnimationFrame(raf);
    mode = 'idle';
    d = 0;
    page.style.transform = '';
    stage.classList.remove('on');
    if (done) { const r = done; done = null; r(); }
  }

  draw(Math.PI / 2);

  return {
    drag(dy) {
      if (mode === 'retract' || mode === 'hold') return;
      d = Math.min(MAX_D, Math.max(0, dy) * 0.8);
      if (mode === 'idle') {
        stage.classList.add('on');
        page.style.transition = 'none';
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
      mode = 'pulling';
    },
    release() {
      if (mode !== 'pulling') return Promise.resolve(false);
      const triggered = progress() >= 0.98;
      return new Promise((resolve) => {
        done = () => resolve(triggered);
        if (triggered) { mode = 'hold'; setTimeout(() => { mode = 'retract'; }, 350); }
        else mode = 'retract';
      });
    },
    get active() { return mode !== 'idle'; },
    get debug() { return { mode, d, p: progress() }; },
  };
}
