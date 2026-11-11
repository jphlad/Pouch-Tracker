import * as DB from './db.js';
import * as S from './stats.js';
import { selectCards } from './health.js';
import { buildExport, mergeImport, toCSV, shareOrDownload, validateImport } from './io.js';

const { state } = DB;
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

const ui = {
  tab: 'log',
  qty: 1,
  range: 30,
  lastLogged: null,
  library: [],
  cards: [],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = S.fmtMg;

const productName = (p) => p ? `${p.brand}${p.line && p.line !== 'Original' ? ' ' + p.line : ''}` : 'Unknown pouch';
const productLabel = (p) => p ? `${productName(p)} · ${p.flavor || 'No flavor'} · ${p.mg}mg` : 'Unknown pouch';
const defaultProduct = () => DB.productById(state.settings.defaultProductId) || DB.activeProducts()[0];
const visibleContexts = () => state.settings.contexts.filter((c) => !c.hidden).map((c) => c.name);

function timeStr(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
}
function agoStr(d) {
  const min = Math.round((Date.now() - new Date(d)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m ago` : `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
function toLocalInput(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

const CONTEXT_ICONS = {
  'Working': '<rect x="3.5" y="7" width="17" height="12" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  'Studying': '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  'Sitting around': '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3.5 13a2 2 0 0 1 4 0v1h9v-1a2 2 0 0 1 4 0v4.5H3.5zM6 17.5V20M18 17.5V20"/>',
  'After a meal': '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16.5 21V3c-2 1.5-3 4-3 7 0 1.5 1 2.5 3 2.5"/>',
  'Social / Drinking': '<path d="M6 4h12l-1.2 8.2A4.8 4.8 0 0 1 12 16.5a4.8 4.8 0 0 1-4.8-4.3zM12 16.5V20M8.5 20h7M6.6 8h10.8"/>',
  'Driving': '<path d="M5 16V11.5L6.8 7a2 2 0 0 1 1.9-1.3h6.6A2 2 0 0 1 17.2 7L19 11.5V16M4 16h16v2.5H4zM5 11.5h14"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
  'Other': '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
};
const ctxIcon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${CONTEXT_ICONS[name] || '<circle cx="12" cy="12" r="7"/>'}</svg>`;

/* ================= Toast ================= */
let toastTimer = null;
function toast(html, action) {
  const el = $('#toast');
  el.innerHTML = `<div class="t-msg">${html}</div>${action ? `<button data-toast-act>${esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  if (action) el.querySelector('[data-toast-act]').onclick = () => { action.fn(); hideToast(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2400);
}
function hideToast() { $('#toast').classList.remove('show'); }

/* ================= Sheets ================= */
function openSheet(render, { onMount } = {}) {
  hideToast();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body"></div></div>`;
  const scrim = root.querySelector('.scrim'), sheet = root.querySelector('.sheet'), body = root.querySelector('.sheet-body');
  const api = {
    body,
    rerender() { body.innerHTML = render(api); onMount && onMount(api); },
    close() {
      scrim.classList.remove('open'); sheet.classList.remove('open');
      setTimeout(() => { if (root.contains(sheet)) root.innerHTML = ''; }, 320);
    },
  };
  api.rerender();
  scrim.onclick = api.close;
  requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('open'); sheet.classList.add('open'); }));
  // swipe down to close
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    sheet.style.transition = ''; sheet.style.transform = '';
    y0 = null;
    if (dy > 110) api.close();
  });
  return api;
}

/* ================= Logging ================= */
async function logEntry(context) {
  const p = defaultProduct();
  if (!p) { toast('Add a pouch first'); return; }
  const e = {
    id: DB.uid(),
    timestamp: new Date().toISOString(),
    productId: p.id,
    mgPerPouch: p.mg,
    count: ui.qty,
    context,
  };
  const qty = ui.qty;
  ui.qty = 1;
  DB.addEntry(e).catch(() => toast('Couldn’t save — storage error'));
  ui.lastLogged = e.id;
  render();
  const chip = view.querySelector(`.chip[data-ctx="${CSS.escape(context)}"]`);
  if (chip) { chip.classList.add('flash'); setTimeout(() => chip.classList.remove('flash'), 350); }
  toast(`Logged <b>${qty}× ${esc(productName(p))} ${p.mg}mg</b> · ${esc(context)} · ${fmt(S.entryMg(e))}mg`, {
    label: 'Undo',
    fn: async () => { await DB.deleteEntry(e.id); render(); toast('Removed'); },
  });
}

/* ================= LOG VIEW ================= */
function renderLog() {
  const now = new Date();
  const today = S.inRange(state.entries, now, now);
  const mg = today.reduce((a, e) => a + S.entryMg(e), 0);
  const pouches = today.reduce((a, e) => a + e.count, 0);
  const last = state.entries[state.entries.length - 1];
  const p = defaultProduct();
  const ctxs = visibleContexts();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const s = state.settings;
  const daysSinceBackup = s.lastBackupAt ? S.daysBetween(new Date(s.lastBackupAt), now) : Infinity;
  const showNudge = state.entries.length >= 15 && daysSinceBackup > 14;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return `
    ${!standalone && /iPhone|iPad/.test(navigator.userAgent) ? `
      <div class="nudge install-hint">Tap <b>Share</b> → <b>Add to Home Screen</b>, then always open from the icon so your data stays put.</div>` : ''}
    <div class="today-head">
      <div>
        <div class="date">${esc(dateStr)}</div>
        <div class="today-big">${fmt(mg)}<small>mg today</small></div>
      </div>
      <div class="today-meta">
        <div><b>${pouches}</b> pouch${pouches === 1 ? '' : 'es'}</div>
        <div>${last ? `last <b>${agoStr(last.timestamp)}</b>` : 'no logs yet'}</div>
      </div>
    </div>

    <button class="product-card" data-act="pick-product" aria-label="Change pouch">
      <div class="can">${p ? p.mg : '–'}</div>
      <div class="pc-main">
        <div class="pc-title">${esc(productName(p))}</div>
        <div class="pc-sub">${p ? `${esc(p.flavor || 'No flavor')} · ${p.mg}mg` : 'Add a pouch to start'}</div>
      </div>
      <div class="pc-change">Change</div>
    </button>

    <div class="seg qty" role="radiogroup" aria-label="How many pouches">
      ${[1, 2, 3, 4].map((v) => `<button role="radio" data-act="qty" data-v="${v}" aria-checked="${ui.qty === v}">${v}×</button>`).join('')}
    </div>

    <div class="log-hint">Tap what you're doing to log${ui.qty > 1 ? ` <b class="up">${ui.qty} pouches · ${fmt(ui.qty * (p?.mg || 0))}mg</b>` : ''}</div>
    <div class="chips">
      ${ctxs.map((c, i) => `<button class="chip${ctxs.length % 2 === 1 && i === ctxs.length - 1 ? ' wide' : ''}" data-act="log" data-ctx="${esc(c)}">${ctxIcon(c)}${esc(c)}</button>`).join('')}
    </div>

    ${showNudge ? `<div class="nudge"><span>${s.lastBackupAt ? `Last backup ${daysSinceBackup} days ago.` : 'No backup yet.'} Data only lives on this phone.</span><button class="btn sm" data-act="export-json">Back up</button></div>` : ''}

    <h2>Today</h2>
    ${today.length ? `<div class="list">${[...today].reverse().map(entryRow).join('')}</div>` : `<div class="list"><div class="empty">Nothing logged yet today.</div></div>`}
    ${state.entries.length > today.length ? `<div style="text-align:center;margin-top:14px"><button class="link-btn" data-act="history">View earlier logs</button></div>` : ''}
  `;
}

function entryRow(e) {
  const p = DB.productById(e.productId);
  return `<button class="row" data-act="edit-entry" data-id="${e.id}">
    <div class="time-col">${timeStr(e.timestamp)}</div>
    <div class="r-main">
      <div class="r-title">${esc(e.context)}${e.count > 1 ? `<span class="badge bark">${e.count}×</span>` : ''}</div>
      <div class="r-sub">${esc(productName(p))} · ${e.mgPerPouch}mg</div>
    </div>
    <div class="r-end"><b>${fmt(S.entryMg(e))}</b>mg</div>
  </button>`;
}

function openProductPicker() {
  const sh = openSheet(() => {
    const ps = DB.activeProducts();
    return `<h3>Which pouch?</h3>
      <div class="list">
        ${ps.map((p) => `<button class="row${p.id === state.settings.defaultProductId ? ' selected' : ''}" data-pick="${p.id}">
          <div class="can" style="width:36px;height:36px;font-size:13px">${p.mg}</div>
          <div class="r-main"><div class="r-title">${esc(productName(p))}</div><div class="r-sub">${esc(p.flavor || '')} · ${p.mg}mg</div></div>
        </button>`).join('')}
        <button class="row" data-add><div class="r-main"><div class="r-title" style="color:var(--accent)">+ Add a pouch</div></div></button>
      </div>`;
  }, {
    onMount(api) {
      api.body.querySelectorAll('[data-pick]').forEach((b) => b.onclick = async () => {
        state.settings.defaultProductId = b.dataset.pick;
        await DB.saveSettings();
        api.close(); render();
      });
      api.body.querySelector('[data-add]').onclick = () => { api.close(); setTimeout(() => openAddProduct({ makeDefault: true }), 250); };
    },
  });
  return sh;
}

function openEditEntry(id) {
  const orig = state.entries.find((e) => e.id === id);
  if (!orig) return;
  const draft = { ...orig };
  openSheet(() => {
    const ps = state.products.filter((p) => !p.archived || p.id === draft.productId);
    const ctxs = [...new Set([...state.settings.contexts.map((c) => c.name), draft.context])];
    return `<h3>Edit log</h3>
      <label class="field"><span>Time</span>
        <input class="input" type="datetime-local" data-f="time" value="${toLocalInput(draft.timestamp)}">
      </label>
      <div class="quick-times">
        ${[5, 15, 30, 60].map((m) => `<button class="pill" data-shift="${m}">−${m < 60 ? m + 'm' : '1h'}</button>`).join('')}
      </div>
      <div class="field"><span>Pouches</span>
        <div class="seg qty" style="margin-top:0">${[1, 2, 3, 4].map((v) => `<button role="radio" data-q="${v}" data-v="${v}" aria-checked="${draft.count === v}">${v}×</button>`).join('')}</div>
      </div>
      <label class="field"><span>Pouch</span>
        <select class="input" data-f="product">${ps.map((p) => `<option value="${p.id}" ${p.id === draft.productId ? 'selected' : ''}>${esc(productLabel(p))}</option>`).join('')}</select>
      </label>
      <label class="field"><span>What you were doing</span>
        <select class="input" data-f="context">${ctxs.map((c) => `<option ${c === draft.context ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Note (optional)</span>
        <input class="input" data-f="note" value="${esc(draft.note || '')}" placeholder="Anything worth remembering">
      </label>
      <div class="btn-row">
        <button class="btn danger" data-del>Delete</button>
        <button class="btn primary" data-save>Save</button>
      </div>`;
  }, {
    onMount(api) {
      const b = api.body;
      const time = b.querySelector('[data-f=time]');
      time.onchange = () => { if (time.value) draft.timestamp = new Date(time.value).toISOString(); };
      b.querySelectorAll('[data-shift]').forEach((x) => x.onclick = () => {
        draft.timestamp = new Date(new Date(draft.timestamp).getTime() - Number(x.dataset.shift) * 60000).toISOString();
        time.value = toLocalInput(draft.timestamp);
      });
      b.querySelectorAll('[data-q]').forEach((x) => x.onclick = () => {
        draft.count = Number(x.dataset.q);
        b.querySelectorAll('[data-q]').forEach((y) => y.setAttribute('aria-checked', y === x));
      });
      b.querySelector('[data-f=product]').onchange = (ev) => {
        draft.productId = ev.target.value;
        const p = DB.productById(draft.productId);
        if (p) draft.mgPerPouch = p.mg;
      };
      b.querySelector('[data-f=context]').onchange = (ev) => { draft.context = ev.target.value; };
      b.querySelector('[data-f=note]').oninput = (ev) => { draft.note = ev.target.value; };
      b.querySelector('[data-save]').onclick = async () => {
        if (!draft.note) delete draft.note;
        await DB.updateEntry(draft); api.close(); render(); toast('Saved');
      };
      b.querySelector('[data-del]').onclick = async () => {
        const removed = { ...orig };
        await DB.deleteEntry(orig.id); api.close(); render();
        toast('Log deleted', { label: 'Undo', fn: async () => { await DB.addEntry(removed); render(); } });
      };
    },
  });
}

function openHistory() {
  let limitDays = 14;
  openSheet(() => {
    const now = new Date();
    const groups = [];
    for (let i = 0; i < limitDays; i++) {
      const d = S.addDays(now, -i);
      const es = S.inRange(state.entries, d, d);
      if (es.length) groups.push({ d, es });
    }
    return `<h3>History</h3>
      ${groups.map(({ d, es }) => `
        <h2 style="margin-top:16px">${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          <span style="float:right;text-transform:none;letter-spacing:0" class="num">${fmt(es.reduce((a, e) => a + S.entryMg(e), 0))}mg</span></h2>
        <div class="list">${[...es].reverse().map(entryRow).join('')}</div>`).join('') || '<div class="empty">No logs yet.</div>'}
      ${S.firstEntryDate(state.entries) && S.daysBetween(S.firstEntryDate(state.entries), now) >= limitDays ? `<div style="text-align:center;margin-top:16px"><button class="link-btn" data-more>Show more</button></div>` : ''}`;
  }, {
    onMount(api) {
      api.body.querySelectorAll('[data-act=edit-entry]').forEach((b) => b.onclick = () => { api.close(); setTimeout(() => openEditEntry(b.dataset.id), 250); });
      const more = api.body.querySelector('[data-more]');
      if (more) more.onclick = () => { limitDays += 30; api.rerender(); };
    },
  });
}

/* ================= TRENDS VIEW ================= */
function rangeBounds() {
  const now = new Date();
  const first = S.firstEntryDate(state.entries) || now;
  if (ui.range === 'all') return { start: S.startOfDay(first), end: now };
  return { start: S.addDays(now, -(ui.range - 1)), end: now };
}

function barChart(series) {
  const W = 340, H = 150, padL = 26, padB = 18, padT = 8;
  const vals = series.map((r) => r.mg);
  const avg = S.rollingAvg(vals, 7);
  const max = Math.max(10, ...vals, ...avg);
  const nice = Math.ceil(max / 20) * 20;
  const n = series.length;
  const bw = (W - padL) / n;
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  const todayKey = S.dayKey(new Date());
  const ticks = [0, nice / 2, nice];
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  let bars = '', labels = '';
  series.forEach((r, i) => {
    const x = padL + i * bw;
    const h = (H - padT - padB) - (y(r.mg) - padT);
    bars += `<rect class="bar${r.key === todayKey ? ' today' : ''}" x="${x + bw * 0.15}" y="${y(r.mg)}" width="${Math.max(1, bw * 0.7)}" height="${Math.max(0, h)}" rx="${Math.min(3, bw * 0.25)}"/>`;
    if (i % labelEvery === 0) labels += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${r.date.toLocaleDateString('en-US', n <= 7 ? { weekday: 'narrow' } : { month: 'numeric', day: 'numeric' })}</text>`;
  });
  const line = avg.map((v, i) => `${i ? 'L' : 'M'}${(padL + i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily mg chart">
    ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${t}</text>`).join('')}
    ${bars}
    ${n > 1 ? `<path class="avg" d="${line}"/>` : ''}
    ${labels}
  </svg>
  <div class="legend"><span><i style="background:var(--forest-bar)"></i>mg per day</span>${n > 1 ? '<span><i style="background:var(--accent)"></i>7-day average</span>' : ''}</div>`;
}

function heatmapSVG(grid) {
  const W = 340, cell = (W - 22) / 24, H = cell * 7 + 18;
  const max = Math.max(1, ...grid.flat());
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let out = '';
  // Start week on Monday
  const order = [1, 2, 3, 4, 5, 6, 0];
  order.forEach((dow, r) => {
    out += `<text x="8" y="${r * cell + cell * 0.72}" text-anchor="middle">${days[dow]}</text>`;
    for (let h = 0; h < 24; h++) {
      const v = grid[dow][h];
      const o = v ? 0.18 + 0.82 * (v / max) : 0;
      out += `<rect x="${22 + h * cell + 1}" y="${r * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2.5" fill="${v ? `rgba(214,200,160,${o.toFixed(2)})` : 'var(--surface-3)'}"/>`;
    }
  });
  [0, 6, 12, 18].forEach((h) => {
    out += `<text x="${22 + h * cell + 1}" y="${7 * cell + 13}">${h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? h + 'a' : (h - 12) + 'p'}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Time of day heatmap">${out}</svg>`;
}

function hbars(items, fmtVal, cls = '') {
  if (!items.length) return '<div class="empty">No data yet.</div>';
  const max = Math.max(...items.map((i) => i.share));
  return items.map((i) => `<div class="hbar ${cls}">
    <div class="hb-top"><span>${esc(i.label)}</span><span>${fmtVal(i)}</span></div>
    <div class="track"><div class="fill" style="width:${(max ? i.share / max : 0) * 100}%"></div></div>
  </div>`).join('');
}

function delta(pct) {
  if (pct == null || !isFinite(pct)) return '';
  const r = Math.round(pct * 100);
  if (r === 0) return `<span class="d">same as previous period</span>`;
  return `<span class="d"><span class="${r > 0 ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'} ${Math.abs(r)}%</span> vs previous period</span>`;
}

function renderTrends() {
  const ranges = [[7, '7D'], [30, '30D'], [90, '90D'], ['all', 'All']];
  const seg = `<div class="seg" role="radiogroup" aria-label="Range" style="margin-top:0">
    ${ranges.map(([v, l]) => `<button role="radio" data-act="range" data-v="${v}" aria-checked="${ui.range === v}">${l}</button>`).join('')}</div>`;
  const header = `<h1>Trends</h1>`;

  const daysLogged = new Set(state.entries.map((e) => S.dayKey(e.timestamp))).size;
  if (daysLogged < 2) {
    return `${header}${seg}<div class="card" style="margin-top:16px"><div class="empty">Log for a couple of days and your patterns will show up here.</div></div>`;
  }

  const now = new Date();
  const { start, end } = rangeBounds();
  const series = S.dailySeries(state.entries, start, end);
  const entries = S.inRange(state.entries, start, end);
  const first = S.firstEntryDate(state.entries);
  const effStart = S.startOfDay(first) > start ? S.startOfDay(first) : start;
  const nDays = S.daysBetween(effStart, end) + 1;
  const totalMg = entries.reduce((a, e) => a + S.entryMg(e), 0);
  const totalP = entries.reduce((a, e) => a + e.count, 0);
  const avgMg = totalMg / nDays, avgP = totalP / nDays;
  const strength = S.avgStrength(entries);

  let cmp = null;
  if (ui.range !== 'all') {
    const prevEnd = S.addDays(start, -1), prevStart = S.addDays(prevEnd, -(ui.range - 1));
    const prev = S.inRange(state.entries, prevStart, prevEnd);
    if (prev.length && S.startOfDay(first) <= prevStart) {
      const pMg = prev.reduce((a, e) => a + S.entryMg(e), 0) / ui.range;
      const pP = prev.reduce((a, e) => a + e.count, 0) / ui.range;
      cmp = { mg: pMg ? (avgMg - pMg) / pMg : null, p: pP ? (avgP - pP) / pP : null, str: S.avgStrength(prev) };
    }
  }

  const ctx = S.shareBy(entries, (e) => e.context).map((x) => ({ ...x, label: x.key }));
  const prod = S.pouchShareBy(entries, (e) => e.productId).map((x) => {
    const p = DB.productById(x.key);
    return { ...x, label: p ? `${productName(p)} ${p.flavor || ''} ${p.mg}mg` : 'Deleted pouch' };
  });
  const dow = S.dowAverages(state.entries, effStart, end);
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowItems = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: dowNames[i], share: dow[i], mg: dow[i] }));
  const maxDow = Math.max(...dow, 1);
  const firsts = S.firstLogMinutes(entries);
  const medFirst = S.median(firsts.map((f) => f.minutes));
  const multi = S.multiRate(entries);
  const late = S.lateShare(entries);

  return `${header}${seg}
    <div class="stat-grid" style="margin-top:14px">
      <div class="stat hero">
        <div class="k">Avg per day</div>
        <div class="v">${fmt(avgMg)}<small>mg</small></div>
        ${cmp ? delta(cmp.mg) : `<span class="d">${nDays} day${nDays === 1 ? '' : 's'} tracked</span>`}
      </div>
      <div class="stat">
        <div class="k">Pouches / day</div>
        <div class="v">${fmt(avgP)}</div>
        ${cmp ? delta(cmp.p) : ''}
      </div>
      <div class="stat">
        <div class="k">Avg strength</div>
        <div class="v">${fmt(strength)}<small>mg</small></div>
        ${cmp && cmp.str ? `<span class="d">was ${fmt(cmp.str)}mg</span>` : ''}
      </div>
      <div class="stat hero">
        <div class="k">Est. absorbed / day <button class="info-btn" data-act="absorb-info" aria-label="About this estimate">i</button></div>
        <div class="v" style="font-size:28px">~${fmt(avgMg * S.ABSORB_LOW)}–${fmt(avgMg * S.ABSORB_HIGH)}<small>mg</small></div>
        <span class="d">Rough estimate. The trend matters more than the number.</span>
      </div>
    </div>

    <h2>Daily nicotine</h2>
    <div class="card">${barChart(series)}</div>

    <h2>When you use</h2>
    <div class="card">${heatmapSVG(S.heatmap(entries))}
      <div class="legend"><span>First pouch typically <b class="num" style="color:var(--stone-hi)">${S.fmtMinutes(medFirst)}</b></span><span>After 9pm: <b class="num" style="color:var(--stone-hi)">${Math.round(late * 100)}%</b></span></div>
    </div>

    <h2>Day of week</h2>
    <div class="card">${dowItems.map((i) => `<div class="hbar"><div class="hb-top"><span>${i.label}</span><span>${fmt(i.mg)}mg</span></div><div class="track"><div class="fill" style="width:${(i.mg / maxDow) * 100}%"></div></div></div>`).join('')}</div>

    <h2>What you were doing</h2>
    <div class="card">${hbars(ctx, (i) => `${Math.round(i.share * 100)}% · ${fmt(i.mg)}mg`)}</div>

    <h2>Pouch mix</h2>
    <div class="card">${hbars(prod, (i) => `${Math.round(i.share * 100)}% · ${i.pouches}`, 'bark')}</div>

    <div class="stat-grid" style="margin-top:12px">
      <div class="stat"><div class="k">Doubled up</div><div class="v">${Math.round(multi * 100)}<small>%</small></div><span class="d">of logs were 2×+</span></div>
      <div class="stat"><div class="k">Pouch time</div><div class="v">${fmt(avgP * S.POUCH_HOURS)}<small>h/day</small></div><span class="d">at ~45 min each</span></div>
    </div>
  `;
}

/* ================= HEALTH VIEW ================= */
function renderHealth() {
  const { cards, context: c } = selectCards(ui.cards, state.entries, state.settings.dismissed || {});
  const enough = c.daysLogged >= 3;
  const kind = (card) => card.trigger === 'always' ? '' : card.trigger.startsWith('band:') ? 'Your range' : 'Your pattern';
  return `<h1>Health</h1>
    <div class="card band-card">
      ${enough ? `
        <div class="muted small">Your 7-day average</div>
        <div class="band-name">${c.band.label}</div>
        <div style="margin-top:4px"><span class="num" style="font-size:20px;font-weight:700">${fmt(c.avg.mg)}mg</span><span class="muted">/day labeled · ${fmt(c.avg.pouches)} pouches</span></div>
        <div class="muted small" style="margin-top:2px">~${fmt(c.avg.mg * S.ABSORB_LOW)}–${fmt(c.avg.mg * S.ABSORB_HIGH)}mg est. absorbed</div>
        <div class="muted small" style="margin-top:10px">Bands (under 30 · 30–60 · 60–100 · 100+ mg/day) are this app's way of organizing info, not medical thresholds.</div>
      ` : `<div class="muted">After about 3 days of logging, cards here will be matched to your actual numbers.</div>`}
    </div>
    ${cards.map((card) => `
      <article class="card fact">
        ${kind(card) ? `<div class="tag">${kind(card)}</div>` : ''}
        <button class="x" data-act="dismiss" data-id="${card.id}" aria-label="Hide for 30 days">×</button>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.body)}</p>
        ${card.numbers ? `<div class="yours">${esc(card.numbers)}</div>` : ''}
        <a class="src" href="${esc(card.source.url)}" target="_blank" rel="noopener">Source: ${esc(card.source.name)} ↗</a>
      </article>`).join('')}
    ${Object.keys(state.settings.dismissed || {}).length ? `<div style="text-align:center;margin-top:16px"><button class="link-btn" data-act="undismiss">Show hidden cards</button></div>` : ''}
    <p class="disclaimer">Info, not medical advice. Sources are linked on each card.</p>`;
}

/* ================= SETTINGS VIEW ================= */
function renderSettings() {
  const s = state.settings;
  const ps = DB.activeProducts();
  const archived = state.products.filter((p) => p.archived);
  return `<h1>Settings</h1>
    <h2>My pouches</h2>
    <div class="list">
      ${ps.map((p) => `<button class="row" data-act="edit-product" data-id="${p.id}">
        <div class="can" style="width:36px;height:36px;font-size:13px">${p.mg}</div>
        <div class="r-main"><div class="r-title">${esc(productName(p))}${p.id === s.defaultProductId ? '<span class="badge green">Default</span>' : ''}</div>
        <div class="r-sub">${esc(p.flavor || 'No flavor')} · ${p.mg}mg</div></div>
        <div class="r-end">›</div>
      </button>`).join('')}
      <button class="row" data-act="add-product"><div class="r-main"><div class="r-title" style="color:var(--accent)">+ Add a pouch</div></div></button>
    </div>
    ${archived.length ? `<div class="small muted" style="margin:8px 4px">${archived.length} archived pouch${archived.length > 1 ? 'es' : ''} kept for history. <button class="link-btn" data-act="show-archived">Manage</button></div>` : ''}

    <h2>Context buttons</h2>
    <div class="list">
      ${s.contexts.map((c, i) => `<div class="row">
        <div class="r-main"><div class="r-title" style="${c.hidden ? 'color:var(--stone-lo)' : ''}">${esc(c.name)}</div></div>
        <button class="icon-btn" data-act="ctx-up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="icon-btn" data-act="ctx-rename" data-i="${i}" aria-label="Rename"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
        <button class="toggle" role="switch" data-act="ctx-toggle" data-i="${i}" aria-checked="${!c.hidden}" aria-label="Show ${esc(c.name)}"></button>
      </div>`).join('')}
      <button class="row" data-act="ctx-add"><div class="r-main"><div class="r-title" style="color:var(--accent)">+ Add a context</div></div></button>
    </div>

    <h2>Backup</h2>
    <div class="card">
      <div class="small muted">Your data lives only on this phone, inside the home-screen app. Deleting the app icon deletes it. Back up every couple of weeks.</div>
      <div class="small" style="margin-top:8px">Last backup: <b>${s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never'}</b> · ${state.entries.length} logs</div>
      <div class="btn-row"><button class="btn primary" data-act="export-json">Export backup</button><button class="btn" data-act="import">Import</button></div>
      <button class="btn block" style="margin-top:10px" data-act="export-csv">Export CSV for spreadsheets</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <h2>About</h2>
    <div class="card small muted">
      Pouch Tracker logs what you use and shows patterns. It isn't a quitting app and doesn't give medical advice. Absorbed-nicotine numbers are rough estimates based on published pouch studies.
    </div>`;
}

/* ================= Product add/edit ================= */
function openAddProduct({ makeDefault = false } = {}) {
  const st = { step: 'brand', item: null, mg: null, flavor: '', custom: { brand: '', line: '', flavor: '', mg: '' } };
  openSheet(() => {
    if (st.step === 'brand') {
      return `<h3>Add a pouch</h3>
        <div class="list">
          ${ui.library.map((it, i) => `<button class="row" data-lib="${i}"><div class="r-main"><div class="r-title">${esc(it.brand)} ${it.line !== 'Original' ? esc(it.line) : ''}</div><div class="r-sub">${it.strengths.join(', ')} mg</div></div><div class="r-end">›</div></button>`).join('')}
          <button class="row" data-custom><div class="r-main"><div class="r-title" style="color:var(--accent)">Something else (custom)</div></div></button>
        </div>`;
    }
    if (st.step === 'detail') {
      const it = st.item;
      return `<h3>${esc(it.brand)} ${it.line !== 'Original' ? esc(it.line) : ''}</h3>
        <div class="field"><span>Strength</span><div class="pill-row">${it.strengths.map((m) => `<button class="pill" data-mg="${m}" aria-pressed="${st.mg === m}">${m}mg</button>`).join('')}</div></div>
        ${it.flavors.length ? `<div class="field"><span>Flavor</span><div class="pill-row">${it.flavors.map((f) => `<button class="pill" data-fl="${esc(f)}" aria-pressed="${st.flavor === f}">${esc(f)}</button>`).join('')}</div></div>` : ''}
        <label class="field"><span>${it.flavors.length ? 'Or type a flavor' : 'Flavor'}</span><input class="input" data-fl-input value="${esc(it.flavors.includes(st.flavor) ? '' : st.flavor)}" placeholder="e.g. Spearmint"></label>
        <div class="btn-row"><button class="btn" data-back>Back</button><button class="btn primary" data-save ${st.mg ? '' : 'disabled style="opacity:.5"'}>Add pouch</button></div>`;
    }
    const c = st.custom;
    return `<h3>Custom pouch</h3>
      <label class="field"><span>Brand</span><input class="input" data-c="brand" value="${esc(c.brand)}" placeholder="e.g. Pablo"></label>
      <label class="field"><span>Line (optional)</span><input class="input" data-c="line" value="${esc(c.line)}" placeholder="e.g. Exclusive"></label>
      <label class="field"><span>Flavor</span><input class="input" data-c="flavor" value="${esc(c.flavor)}" placeholder="e.g. Ice Cold"></label>
      <label class="field"><span>Nicotine per pouch (mg)</span><input class="input" data-c="mg" value="${esc(c.mg)}" inputmode="decimal" placeholder="e.g. 26"></label>
      <div class="btn-row"><button class="btn" data-back>Back</button><button class="btn primary" data-save>Add pouch</button></div>`;
  }, {
    onMount(api) {
      const b = api.body;
      const save = async (p) => {
        await DB.upsertProduct(p);
        if (makeDefault || !state.settings.defaultProductId) { state.settings.defaultProductId = p.id; await DB.saveSettings(); }
        api.close(); render(); toast(`Added ${esc(productLabel(p))}`);
      };
      b.querySelectorAll('[data-lib]').forEach((x) => x.onclick = () => {
        st.item = ui.library[Number(x.dataset.lib)];
        st.mg = st.item.strengths.length === 1 ? st.item.strengths[0] : null;
        st.step = 'detail'; api.rerender();
      });
      const cu = b.querySelector('[data-custom]');
      if (cu) cu.onclick = () => { st.step = 'custom'; api.rerender(); };
      b.querySelectorAll('[data-mg]').forEach((x) => x.onclick = () => { st.mg = Number(x.dataset.mg); api.rerender(); });
      b.querySelectorAll('[data-fl]').forEach((x) => x.onclick = () => { st.flavor = x.dataset.fl; api.rerender(); });
      const fi = b.querySelector('[data-fl-input]');
      if (fi) fi.oninput = () => {
        st.flavor = fi.value;
        b.querySelectorAll('[data-fl]').forEach((y) => y.setAttribute('aria-pressed', 'false'));
      };
      b.querySelectorAll('[data-c]').forEach((x) => x.oninput = () => { st.custom[x.dataset.c] = x.value; });
      const back = b.querySelector('[data-back]');
      if (back) back.onclick = () => { st.step = 'brand'; api.rerender(); };
      const sv = b.querySelector('[data-save]');
      if (sv) sv.onclick = () => {
        const now = new Date().toISOString();
        if (st.step === 'detail') {
          if (!st.mg) return;
          save({ id: DB.uid(), brand: st.item.brand, line: st.item.line, flavor: st.flavor.trim(), mg: st.mg, isFavorite: true, archived: false, createdAt: now });
        } else {
          const mg = parseFloat(String(st.custom.mg).replace(',', '.'));
          if (!st.custom.brand.trim() || !(mg > 0)) { toast('Brand and mg are required'); return; }
          save({ id: DB.uid(), brand: st.custom.brand.trim(), line: st.custom.line.trim() || 'Original', flavor: st.custom.flavor.trim(), mg, isFavorite: true, archived: false, createdAt: now });
        }
      };
    },
  });
}

function openEditProduct(id) {
  const p = { ...DB.productById(id) };
  if (!p.id) return;
  openSheet(() => `<h3>Edit pouch</h3>
    <label class="field"><span>Brand</span><input class="input" data-f="brand" value="${esc(p.brand)}"></label>
    <label class="field"><span>Line</span><input class="input" data-f="line" value="${esc(p.line)}"></label>
    <label class="field"><span>Flavor</span><input class="input" data-f="flavor" value="${esc(p.flavor)}"></label>
    <label class="field"><span>Nicotine per pouch (mg)</span><input class="input" data-f="mg" value="${p.mg}" inputmode="decimal"></label>
    <div class="small muted" style="margin:8px 2px">Changing mg only affects future logs. Past logs keep the strength they were logged with.</div>
    ${p.id !== state.settings.defaultProductId ? `<button class="btn block" style="margin-top:8px" data-default>Make default</button>` : ''}
    <div class="btn-row"><button class="btn danger" data-archive>${p.archived ? 'Restore' : 'Remove'}</button><button class="btn primary" data-save>Save</button></div>`, {
    onMount(api) {
      const b = api.body;
      b.querySelectorAll('[data-f]').forEach((x) => x.oninput = () => { p[x.dataset.f] = x.value; });
      b.querySelector('[data-save]').onclick = async () => {
        const mg = parseFloat(String(p.mg).replace(',', '.'));
        if (!(mg > 0) || !String(p.brand).trim()) { toast('Brand and mg are required'); return; }
        p.mg = mg;
        await DB.upsertProduct(p); api.close(); render(); toast('Saved');
      };
      const d = b.querySelector('[data-default]');
      if (d) d.onclick = async () => { state.settings.defaultProductId = p.id; await DB.saveSettings(); api.close(); render(); };
      b.querySelector('[data-archive]').onclick = async () => {
        let msg;
        if (p.archived) {
          p.archived = false; await DB.upsertProduct(p); msg = 'Restored';
        } else {
          if (DB.activeProducts().length <= 1) { toast('Keep at least one pouch'); return; }
          const used = state.entries.some((e) => e.productId === p.id);
          if (used) { p.archived = true; await DB.upsertProduct(p); msg = 'Removed (kept in history)'; }
          else { await DB.deleteProduct(p.id); msg = 'Removed'; }
          if (state.settings.defaultProductId === p.id) {
            state.settings.defaultProductId = DB.activeProducts()[0]?.id || null;
            await DB.saveSettings();
          }
        }
        api.close(); render(); toast(msg);
      };
    },
  });
}

function openArchived() {
  openSheet(() => `<h3>Archived pouches</h3>
    <div class="small muted" style="margin:0 2px 10px">These are hidden from logging but kept so your history stays accurate.</div>
    <div class="list">${state.products.filter((p) => p.archived).map((p) => `<button class="row" data-id="${p.id}"><div class="r-main"><div class="r-title">${esc(productLabel(p))}</div></div><div class="link-btn">Restore</div></button>`).join('') || '<div class="empty">None</div>'}</div>`, {
    onMount(api) {
      api.body.querySelectorAll('[data-id]').forEach((x) => x.onclick = async () => {
        const p = DB.productById(x.dataset.id); p.archived = false; await DB.upsertProduct(p); api.rerender(); render();
      });
    },
  });
}

/* ================= Backup ================= */
async function exportJSON() {
  const data = buildExport(state);
  const name = `pouch-tracker-backup-${S.dayKey(new Date())}.json`;
  const res = await shareOrDownload(name, JSON.stringify(data, null, 2), 'application/json');
  if (res !== 'cancelled') {
    state.settings.lastBackupAt = new Date().toISOString();
    await DB.saveSettings(); render(); toast('Backup exported');
  }
}
async function exportCSV() {
  await shareOrDownload(`pouch-tracker-${S.dayKey(new Date())}.csv`, toCSV(state.entries, state.products), 'text/csv');
}
function startImport() {
  const input = $('#import-file');
  input.value = '';
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      validateImport(obj);
      const newOnes = obj.entries.filter((e) => !state.entries.some((x) => x.id === e.id)).length;
      if (!confirm(`Import ${obj.entries.length} logs (${newOnes} new) and ${obj.products.length} pouches? Matching items will be replaced by the backup's version.`)) return;
      const merged = mergeImport(state, obj);
      await DB.replaceAll(merged);
      render(); toast('Backup imported');
    } catch (err) {
      toast(esc(err.message || 'Import failed'));
    }
  };
  input.click();
}

/* ================= Router & events ================= */
function render() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === ui.tab));
  const html = ui.tab === 'log' ? renderLog() : ui.tab === 'trends' ? renderTrends() : ui.tab === 'health' ? renderHealth() : renderSettings();
  view.innerHTML = html;
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  if (ui.tab === t.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  ui.tab = t.dataset.tab; hideToast(); render(); window.scrollTo(0, 0);
}));

view.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const s = state.settings;
  switch (act) {
    case 'log': return logEntry(el.dataset.ctx);
    case 'qty': ui.qty = Number(el.dataset.v); return render();
    case 'pick-product': return openProductPicker();
    case 'edit-entry': return openEditEntry(el.dataset.id);
    case 'history': return openHistory();
    case 'range': ui.range = el.dataset.v === 'all' ? 'all' : Number(el.dataset.v); return render();
    case 'absorb-info':
      return openSheet(() => `<h3>About this estimate</h3><p class="muted" style="line-height:1.55">The mg on the can is what's in the pouch, not what reaches your blood. Studies of nicotine pouches held in for about an hour found roughly half the nicotine gets extracted, with big differences between people and products. This app shows labeled mg × 0.4–0.6.</p><p class="muted" style="line-height:1.55">Because you use pouches the same way every time, changes in this number over weeks mean more than the number itself.</p>`);
    case 'dismiss':
      s.dismissed = s.dismissed || {};
      s.dismissed[el.dataset.id] = S.addDays(new Date(), 30).toISOString();
      await DB.saveSettings(); render();
      return toast('Hidden for 30 days');
    case 'undismiss': s.dismissed = {}; await DB.saveSettings(); return render();
    case 'add-product': return openAddProduct();
    case 'edit-product': return openEditProduct(el.dataset.id);
    case 'show-archived': return openArchived();
    case 'ctx-up': {
      const i = Number(el.dataset.i); if (i <= 0) return;
      [s.contexts[i - 1], s.contexts[i]] = [s.contexts[i], s.contexts[i - 1]];
      await DB.saveSettings(); return render();
    }
    case 'ctx-toggle': {
      const c = s.contexts[Number(el.dataset.i)];
      if (!c.hidden && visibleContexts().length <= 1) return toast('Keep at least one context');
      c.hidden = !c.hidden; await DB.saveSettings(); return render();
    }
    case 'ctx-rename': {
      const c = s.contexts[Number(el.dataset.i)];
      const name = prompt('Rename context', c.name);
      if (!name || !name.trim() || name.trim() === c.name) return;
      if (s.contexts.some((x) => x.name === name.trim())) return toast('That name already exists');
      const old = c.name; c.name = name.trim();
      // keep history consistent with the renamed button
      for (const e of state.entries.filter((x) => x.context === old)) { e.context = c.name; DB.updateEntry(e); }
      await DB.saveSettings(); return render();
    }
    case 'ctx-add': {
      const name = prompt('New context name');
      if (!name || !name.trim()) return;
      if (s.contexts.some((x) => x.name === name.trim())) return toast('That name already exists');
      s.contexts.push({ name: name.trim(), hidden: false }); await DB.saveSettings(); return render();
    }
    case 'export-json': return exportJSON();
    case 'export-csv': return exportCSV();
    case 'import': return startImport();
  }
});

// keep "last pouch X ago" fresh
setInterval(() => { if (ui.tab === 'log' && !document.hidden && !$('#sheet-root').children.length) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.tab === 'log') render(); });

async function boot() {
  try {
    const [lib, cards] = await Promise.all([
      fetch('data/pouch-library.json').then((r) => r.json()),
      fetch('data/health-cards.json').then((r) => r.json()),
      DB.load(),
    ]);
    ui.library = lib; ui.cards = cards;
  } catch (err) {
    view.innerHTML = `<div class="card" style="margin-top:40px"><b>Couldn't start.</b><div class="muted small" style="margin-top:6px">${esc(err.message)}</div></div>`;
    return;
  }
  render();
}
boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
