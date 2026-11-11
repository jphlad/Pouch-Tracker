// Pull-down tin. Flat 2D, on a layer behind the page.
// The tin stands upright (like a coin on its edge) and spins as you pull.
// It sits tucked behind the page until you've pulled far enough to reveal it,
// and lands with the lid facing you at full reach.

const C = {
  stage: '#2F6A49',
  lidFace: '#EEE6D3',
  lidSide: '#D2C6AB',
  mark: '#2A6646',
  body: '#174029',
  bodyDark: '#113221',
  bottom: '#1A452D',
  seam: '#0E2A1B',
};

const R = 64;        // tin radius (px)
const LID_T = 10;    // lid thickness (flush with the body, no lip)
const BODY_T = 28;   // body thickness
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

  // Edge shading: the side of a cylinder curves top-to-bottom, so light falls off vertically.
  const defs = el('defs');
  const grad = (id, stops) => {
    const lg = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    stops.forEach(([o, c]) => lg.append(el('stop', { offset: o, 'stop-color': c })));
    defs.append(lg);
  };
  grad('tin-lid-side', [[0, '#E6DCC5'], [0.35, '#D8CCB1'], [0.75, '#C6B898'], [1, '#B0A182']]);
  grad('tin-body-side', [[0, '#2C6447'], [0.35, '#1F5137'], [0.75, '#16402A'], [1, '#10311F']]);
  svg.append(defs);
  svg.setAttribute('shape-rendering', 'geometricPrecision');
  const g = el('g');
  svg.append(g);

  // Face art lives in a group squashed horizontally as the tin turns.
  function lidFace(cx, sx) {
    const f = el('g', { transform: `translate(${cx} ${CY}) scale(${sx} 1)` });
    f.append(
      el('circle', { r: R, fill: C.lidFace }),
      el('rect', { x: -R * 0.5, y: -R * 0.25, width: R, height: R * 0.5, rx: R * 0.21, fill: 'none', stroke: C.mark, 'stroke-width': 7 }),
    );
    return f;
  }
  function bottomFace(cx, sx) {
    const f = el('g', { transform: `translate(${cx} ${CY}) scale(${sx} 1)` });
    f.append(
      el('circle', { r: R, fill: C.bottom }),
    );
    return f;
  }
  // One continuous shape for a stretch of the tin's side: the area swept by the disc
  // between two positions along its axis. Drawing it as a single path (instead of caps +
  // rectangles) means there are no seams or color breaks as the tin turns.
  function side(x1, x2, rx, fill) {
    const a = Math.min(x1, x2) - 0.4, b = Math.max(x1, x2) + 0.4; // tiny overlap hides AA hairlines
    const r = Math.max(0.01, rx);
    return el('path', {
      d: `M ${a} ${CY - R} L ${b} ${CY - R} A ${r} ${R} 0 0 1 ${b} ${CY + R} L ${a} ${CY + R} A ${r} ${R} 0 0 1 ${a} ${CY - R} Z`,
      fill,
    });
  }

  // theta = rotation about the vertical axis. 0 = lid facing you.
  function draw(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const rx = R * Math.abs(c);
    const xFront = CX + (TOTAL_T / 2) * s;           // lid face
    const xLidIn = CX + (TOTAL_T / 2 - LID_T) * s;   // where lid meets body
    const xBack = CX - (TOTAL_T / 2) * s;            // bottom face
    const lidSide = side(xFront, xLidIn, rx, 'url(#tin-lid-side)');
    const bodySide = side(xLidIn, xBack, rx, 'url(#tin-body-side)');
    g.replaceChildren();
    if (c >= 0) g.append(bodySide, lidSide, lidFace(xFront, Math.max(c, 0.001)));
    else g.append(lidSide, bodySide, bottomFace(xBack, Math.max(-c, 0.001)));

    // the seam where you pry the lid off: a thin line around the tin, on the visible side
    const bandSide = c >= 0 ? Math.sign(xBack - xFront) : Math.sign(xFront - xBack);
    if (Math.abs(s) > 0.12 && bandSide !== 0) {
      g.append(el('path', {
        d: `M ${xLidIn} ${CY - R} A ${Math.max(0.01, rx)} ${R} 0 0 ${bandSide > 0 ? 1 : 0} ${xLidIn} ${CY + R}`,
        fill: 'none', stroke: '#0E2A1B', 'stroke-width': 1.2, 'stroke-linecap': 'butt', opacity: 0.55,
        'stroke-dasharray': `0 3 ${Math.PI * R} 3`,
      }));
    }
  }

  // ---- gesture state ----
  const MAX_D = 250;   // how far the page slides down at full reach
  const SPINS = 1.25;  // turns completed on the way to full reach
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
    page.classList.remove('lifted');
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
        page.classList.add('lifted');
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
