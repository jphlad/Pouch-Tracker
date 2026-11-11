// Pull-down tin. A 2D layer that sits *behind* the page: as you pull, the page slides
// down and the tin rises out from behind its top edge, lit by warm ~1800K light.
// Release past the threshold and the lid pops and pouches spill in slow motion,
// tumbling back down behind the page.

const LID_EMBOSS = (cx, cy) => {
  // the app's sideways-pouch outline, projected onto the lid ellipse
  return `<g transform="translate(${cx} ${cy}) scale(1 0.31)">
    <rect x="-46" y="-24" width="92" height="48" rx="19" fill="none" stroke="rgba(255,214,160,.55)" stroke-width="5" transform="translate(0 4)"/>
    <rect x="-46" y="-24" width="92" height="48" rx="19" fill="none" stroke="#25583C" stroke-width="6"/>
  </g>`;
};

const TIN_BODY = `
<svg class="tin-body" viewBox="0 0 200 145" aria-hidden="true">
  <defs>
    <linearGradient id="tb-body" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#06160e"/>
      <stop offset=".08" stop-color="#123522"/>
      <stop offset=".22" stop-color="#2b6446"/>
      <stop offset=".29" stop-color="#8c8a5a"/>
      <stop offset=".315" stop-color="#e2a867"/>
      <stop offset=".34" stop-color="#7e8656"/>
      <stop offset=".42" stop-color="#2f6b4a"/>
      <stop offset=".7" stop-color="#1a4430"/>
      <stop offset=".9" stop-color="#0c271a"/>
      <stop offset="1" stop-color="#05120b"/>
    </linearGradient>
    <linearGradient id="tb-shade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </linearGradient>
    <radialGradient id="tb-inside" cx=".5" cy=".7" r=".7">
      <stop offset="0" stop-color="#2a1c10"/>
      <stop offset="1" stop-color="#0a120c"/>
    </radialGradient>
    <linearGradient id="tb-lip" x1="0" x2="1">
      <stop offset="0" stop-color="#3b2f20"/>
      <stop offset=".3" stop-color="#f3c88d"/>
      <stop offset=".5" stop-color="#9c7f57"/>
      <stop offset="1" stop-color="#2a2016"/>
    </linearGradient>
  </defs>
  <!-- inside of the can (seen when the lid is off) -->
  <ellipse cx="100" cy="58" rx="84" ry="25" fill="url(#tb-inside)"/>
  <g class="tin-nest"></g>
  <!-- body -->
  <path d="M16 58 L16 112 A84 25 0 0 0 184 112 L184 58 A84 25 0 0 1 16 58 Z" fill="url(#tb-body)"/>
  <path d="M16 58 L16 112 A84 25 0 0 0 184 112 L184 58 A84 25 0 0 1 16 58 Z" fill="url(#tb-shade)"/>
  <path d="M16 112 A84 25 0 0 0 184 112" fill="none" stroke="rgba(255,175,100,.25)" stroke-width="1.5"/>
  <path d="M16 58 A84 25 0 0 0 184 58" fill="none" stroke="url(#tb-lip)" stroke-width="3"/>
</svg>`;

const TIN_LID = `
<svg class="tin-lid" viewBox="0 0 200 90" aria-hidden="true">
  <defs>
    <linearGradient id="tl-rim" x1="0" x2="1">
      <stop offset="0" stop-color="#4f3f2b"/>
      <stop offset=".16" stop-color="#b79a72"/>
      <stop offset=".28" stop-color="#ffe0b0"/>
      <stop offset=".34" stop-color="#e9cfa3"/>
      <stop offset=".7" stop-color="#a68c68"/>
      <stop offset="1" stop-color="#3c2f20"/>
    </linearGradient>
    <radialGradient id="tl-top" cx=".32" cy=".25" r=".85">
      <stop offset="0" stop-color="#fff1d6"/>
      <stop offset=".35" stop-color="#f1dcb6"/>
      <stop offset=".75" stop-color="#cdb48c"/>
      <stop offset="1" stop-color="#8f7a5a"/>
    </radialGradient>
  </defs>
  <path d="M10 34 L10 52 A90 28 0 0 0 190 52 L190 34 Z" fill="url(#tl-rim)"/>
  <ellipse cx="100" cy="34" rx="90" ry="28" fill="url(#tl-top)"/>
  <ellipse cx="100" cy="34" rx="78" ry="23" fill="none" stroke="rgba(110,88,60,.35)" stroke-width="2"/>
  <ellipse cx="100" cy="35" rx="78" ry="23" fill="none" stroke="rgba(255,226,180,.5)" stroke-width="1"/>
  ${LID_EMBOSS(100, 34)}
</svg>`;

const POUCH = (i) => `
<svg viewBox="0 0 64 30" aria-hidden="true">
  <defs>
    <radialGradient id="pg${i}" cx=".3" cy=".22" r=".95">
      <stop offset="0" stop-color="#fff4de"/>
      <stop offset=".45" stop-color="#ecdcbc"/>
      <stop offset=".85" stop-color="#c5ad86"/>
      <stop offset="1" stop-color="#9c8562"/>
    </radialGradient>
  </defs>
  <rect x="1" y="1" width="62" height="28" rx="13" fill="url(#pg${i})"/>
  <rect x="5" y="5" width="54" height="20" rx="9.5" fill="none" stroke="rgba(140,110,72,.45)" stroke-width="1.1" stroke-dasharray="1.2 2.6" stroke-linecap="round"/>
  <path d="M10 6 Q32 2 54 6" fill="none" stroke="rgba(255,248,232,.7)" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const css = `
.tin-stage {
  position: fixed; left: 0; right: 0; top: 0; height: 380px; z-index: 0; overflow: hidden;
  visibility: hidden; pointer-events: none;
  background:
    radial-gradient(60% 55% at 32% 62%, rgba(255,136,36,.30), rgba(255,136,36,0) 70%),
    radial-gradient(90% 80% at 50% 100%, rgba(255,150,60,.10), rgba(0,0,0,0) 70%),
    linear-gradient(#081a10, #0e2b1a 70%, #12351F);
}
.tin-stage.on { visibility: visible; }
.tin-wrap { position: absolute; left: 50%; width: 168px; margin-left: -84px; top: 0; will-change: transform; }
.tin-wrap .tin-body { position: absolute; left: 0; top: 30px;  width: 168px; height: auto; display: block;
  filter: drop-shadow(0 18px 22px rgba(0,0,0,.55)); }
.tin-wrap .tin-lid { position: absolute; left: -3px; top: 30px; width: 174px; height: auto; display: block; transform-origin: 50% 60%;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.45)); will-change: transform; }
.tin-glow { position: absolute; left: 50%; width: 320px; height: 220px; margin-left: -190px; top: 0; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,140,40,.38), rgba(255,140,40,0)); filter: blur(8px); opacity: 0; will-change: transform, opacity; }
.tin-pouch { position: absolute; left: 0; top: 0; width: 46px; height: auto; will-change: transform;
  filter: drop-shadow(0 6px 7px rgba(0,0,0,.45)); }
.tin-pouch svg { display: block; width: 100%; height: auto; }
`;

export function createTin(page) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const stage = document.createElement('div');
  stage.className = 'tin-stage';
  stage.innerHTML = `<div class="tin-glow"></div><div class="tin-wrap">${TIN_BODY}${TIN_LID}</div>`;
  document.body.insertBefore(stage, document.body.firstChild);
  const wrap = stage.querySelector('.tin-wrap');
  const lid = stage.querySelector('.tin-lid');
  const glow = stage.querySelector('.tin-glow');

  const MAX_D = 270;      // how far the page slides down
  const THRESH_D = 220;   // reveal distance that counts as a full pull
  const RISE = 175;       // how far the tin rises out from behind the page edge

  let d = 0, mode = 'idle', raf = 0, done = null;
  let pouches = [], lidState = null, t0 = 0, last = 0;

  const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
  const p = () => d / THRESH_D;

  function layout() {
    const pr = ease(p());
    page.style.transform = `translateY(${d}px)`;
    // the tin's top starts tucked just under the page edge and rises as you pull
    const top = d - RISE * pr + 14;
    wrap.style.transform = `translateY(${top}px)`;
    glow.style.transform = `translateY(${top - 40}px)`;
    glow.style.opacity = String(0.35 + 0.65 * pr);
    if (mode === 'pulling') {
      const strain = Math.max(0, p() - 0.92);
      lid.style.transform = strain ? `translateY(${-strain * 40}px) rotate(${Math.sin(performance.now() / 45) * strain * 6}deg)` : '';
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, ((ts - (last || ts)) / 1000)); last = ts;
    if (mode === 'pulling') layout();
    else if (mode === 'retract') {
      d = Math.max(0, d - Math.max(14, d * 0.16));
      layout();
      if (d <= 0) return finish();
    } else if (mode === 'burst') {
      const slow = 0.5, s = dt * slow, G = 1500;
      const el = (ts - t0) / 1000;
      // lid flips up and away
      lidState.vy += G * s; lidState.x += lidState.vx * s; lidState.y += lidState.vy * s; lidState.r += lidState.vr * s;
      lidState.sy = Math.cos(el * 2.2);
      lid.style.transform = `translate(${lidState.x}px, ${lidState.y}px) rotate(${lidState.r}deg) scaleY(${lidState.sy.toFixed(3)})`;
      for (const q of pouches) {
        if (el < q.delay) continue;
        q.el.style.opacity = '1';
        q.vy += G * s; q.x += q.vx * s; q.y += q.vy * s; q.r += q.vr * s;
        q.sx = 0.75 + 0.25 * Math.cos(el * q.flip);
        q.el.style.transform = `translate(${q.x}px, ${q.y}px) rotate(${q.r}deg) scaleX(${q.sx.toFixed(3)})`;
      }
      if (el > 2.9) {
        // page settles back over the stage; pouches tumble behind it
        d = Math.max(0, d - Math.max(10, d * 0.12));
        page.style.transform = `translateY(${d}px)`;
        if (d <= 0) return finish();
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    stage.classList.add('on');
    page.style.transition = 'none';
    last = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function reset() {
    pouches.forEach((q) => q.el.remove());
    pouches = [];
    lid.style.transform = '';
    wrap.style.transform = '';
  }

  function finish() {
    cancelAnimationFrame(raf);
    mode = 'idle';
    d = 0;
    page.style.transform = '';
    stage.classList.remove('on');
    reset();
    if (done) { const r = done; done = null; r(); }
  }

  function burst() {
    mode = 'burst';
    t0 = performance.now();
    const wrapTop = d - RISE + 14;
    const mouthX = window.innerWidth / 2, mouthY = wrapTop + 30 + 58 * (168 / 200);
    lidState = { x: 0, y: 0, r: 0, vx: -190, vy: -600, vr: -70, sy: 1 };
    const N = 13;
    for (let i = 0; i < N; i++) {
      const el = document.createElement('div');
      el.className = 'tin-pouch';
      el.innerHTML = POUCH(i);
      el.style.opacity = '0';
      stage.appendChild(el);
      const spread = (i / (N - 1) - 0.5);
      pouches.push({
        el,
        x: mouthX - 23 + spread * 70 + (Math.random() - 0.5) * 16,
        y: mouthY - 14 + Math.random() * 8,
        vx: spread * 360 + (Math.random() - 0.5) * 90,
        vy: -(470 + Math.random() * 190),
        r: (Math.random() - 0.5) * 60,
        vr: (Math.random() - 0.5) * 420,
        flip: 2 + Math.random() * 4,
        sx: 1,
        delay: 0.05 + i * 0.045 + Math.random() * 0.06,
      });
    }
  }

  return {
    /** dy: raw finger travel in px */
    drag(dy) {
      if (mode === 'burst' || mode === 'retract') return;
      const raw = Math.max(0, dy);
      // rubber band: 1:1-ish at first, then resistance past the threshold
      const K = 0.85, rawT = THRESH_D / K;
      d = raw < rawT ? raw * K : THRESH_D + (raw - rawT) * 0.3;
      d = Math.min(d, MAX_D);
      if (mode === 'idle') { reset(); start(); }
      mode = 'pulling';
    },
    release({ reducedMotion = false } = {}) {
      if (mode !== 'pulling') return Promise.resolve(false);
      const triggered = p() >= 1;
      return new Promise((resolve) => {
        done = () => resolve(triggered);
        lid.style.transform = '';
        if (triggered && !reducedMotion) burst();
        else mode = 'retract';
      });
    },
    get active() { return mode !== 'idle'; },
    get debug() { return { mode, d, p: p() }; },
  };
}
