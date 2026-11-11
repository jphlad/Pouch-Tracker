// Pure calculation helpers. No DOM, no storage — safe to unit test in Node.
// All day math uses the device's local time zone.

export const ABSORB_LOW = 0.4;
export const ABSORB_MID = 0.5;
export const ABSORB_HIGH = 0.6;
export const POUCH_HOURS = 0.75; // ~45 min per pouch

export const BANDS = [
  { id: 'light', label: 'Light', min: 0, max: 30 },
  { id: 'moderate', label: 'Moderate', min: 30, max: 60 },
  { id: 'heavy', label: 'Heavy', min: 60, max: 100 },
  { id: 'very_heavy', label: 'Very heavy', min: 100, max: Infinity },
];

export const entryMg = (e) => (Number(e.count) || 0) * (Number(e.mgPerPouch) || 0);

export function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function startOfDay(d) {
  const x = d instanceof Date ? new Date(d) : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

// DST-safe: build dates from calendar parts instead of adding milliseconds.
export function addDays(d, n) {
  const x = startOfDay(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n);
}

export function daysBetween(a, b) {
  // whole calendar days from a to b
  const A = startOfDay(a), B = startOfDay(b);
  return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) -
    Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000);
}

export function bandFor(avgMg) {
  return BANDS.find((b) => avgMg >= b.min && avgMg < b.max) || BANDS[0];
}

/** Entries whose local day is in [startDay, endDay] inclusive. */
export function inRange(entries, startDay, endDay) {
  const s = startOfDay(startDay).getTime();
  const e = addDays(endDay, 1).getTime();
  return entries.filter((x) => {
    const t = new Date(x.timestamp).getTime();
    return t >= s && t < e;
  });
}

export function byDay(entries) {
  const map = new Map();
  for (const e of entries) {
    const k = dayKey(e.timestamp);
    const v = map.get(k) || { mg: 0, pouches: 0, logs: 0 };
    v.mg += entryMg(e);
    v.pouches += Number(e.count) || 0;
    v.logs += 1;
    map.set(k, v);
  }
  return map;
}

/** One row per calendar day from startDay..endDay inclusive (zero-filled). */
export function dailySeries(entries, startDay, endDay) {
  const map = byDay(inRange(entries, startDay, endDay));
  const out = [];
  const n = daysBetween(startDay, endDay);
  for (let i = 0; i <= n; i++) {
    const d = addDays(startDay, i);
    const k = dayKey(d);
    out.push({ date: d, key: k, ...(map.get(k) || { mg: 0, pouches: 0, logs: 0 }) });
  }
  return out;
}

export function rollingAvg(values, window = 7) {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - window + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

export function firstEntryDate(entries) {
  if (!entries.length) return null;
  let min = Infinity;
  for (const e of entries) min = Math.min(min, new Date(e.timestamp).getTime());
  return new Date(min);
}

/**
 * Average per-day totals over the last `days` days ending at `endDay` (inclusive).
 * Denominator is shortened if tracking started inside the window.
 */
export function windowAvg(entries, endDay, days) {
  const startDay = addDays(endDay, -(days - 1));
  const first = firstEntryDate(entries);
  if (!first) return { mg: 0, pouches: 0, days: 0 };
  const effStart = startOfDay(first) > startDay ? startOfDay(first) : startDay;
  const n = daysBetween(effStart, endDay) + 1;
  if (n <= 0) return { mg: 0, pouches: 0, days: 0 };
  const sub = inRange(entries, effStart, endDay);
  const mg = sub.reduce((a, e) => a + entryMg(e), 0);
  const pouches = sub.reduce((a, e) => a + (Number(e.count) || 0), 0);
  return { mg: mg / n, pouches: pouches / n, days: n, totalMg: mg, totalPouches: pouches };
}

/**
 * The "7-day average" used for health bands. Uses completed days (ending yesterday)
 * so a half-finished today doesn't drag it down; falls back to today if that's all there is.
 */
export function recentAvg(entries, now = new Date(), days = 7) {
  const first = firstEntryDate(entries);
  if (!first) return { mg: 0, pouches: 0, days: 0 };
  const yesterday = addDays(now, -1);
  if (startOfDay(first) > startOfDay(yesterday)) return windowAvg(entries, now, 1);
  return windowAvg(entries, yesterday, days);
}

export function avgStrength(entries) {
  const p = entries.reduce((a, e) => a + (Number(e.count) || 0), 0);
  if (!p) return 0;
  return entries.reduce((a, e) => a + entryMg(e), 0) / p;
}

export function periodCompare(entries, now, days) {
  const end = addDays(now, -1);
  const curStart = addDays(end, -(days - 1));
  const prevEnd = addDays(curStart, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  const cur = inRange(entries, curStart, end);
  const prev = inRange(entries, prevStart, prevEnd);
  const curMg = cur.reduce((a, e) => a + entryMg(e), 0) / days;
  const prevMg = prev.reduce((a, e) => a + entryMg(e), 0) / days;
  const prevDaysLogged = new Set(prev.map((e) => dayKey(e.timestamp))).size;
  return {
    cur, prev, curMg, prevMg, prevDaysLogged,
    pct: prevMg > 0 ? (curMg - prevMg) / prevMg : null,
  };
}

export function heatmap(entries) {
  // rows = weekday 0 (Sun)..6, cols = hour 0..23
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const e of entries) {
    const d = new Date(e.timestamp);
    grid[d.getDay()][d.getHours()] += entryMg(e);
  }
  return grid;
}

export function dowAverages(entries, startDay, endDay) {
  const series = dailySeries(entries, startDay, endDay);
  const sum = Array(7).fill(0), cnt = Array(7).fill(0);
  for (const r of series) { sum[r.date.getDay()] += r.mg; cnt[r.date.getDay()] += 1; }
  return sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
}

export function shareBy(entries, keyFn) {
  const total = entries.reduce((a, e) => a + entryMg(e), 0);
  const map = new Map();
  for (const e of entries) {
    const k = keyFn(e);
    map.set(k, (map.get(k) || 0) + entryMg(e));
  }
  return [...map.entries()]
    .map(([key, mg]) => ({ key, mg, share: total ? mg / total : 0 }))
    .sort((a, b) => b.mg - a.mg);
}

export function pouchShareBy(entries, keyFn) {
  const total = entries.reduce((a, e) => a + (Number(e.count) || 0), 0);
  const map = new Map();
  for (const e of entries) {
    const k = keyFn(e);
    map.set(k, (map.get(k) || 0) + (Number(e.count) || 0));
  }
  return [...map.entries()]
    .map(([key, pouches]) => ({ key, pouches, share: total ? pouches / total : 0 }))
    .sort((a, b) => b.pouches - a.pouches);
}

export function multiRate(entries) {
  if (!entries.length) return 0;
  return entries.filter((e) => Number(e.count) >= 2).length / entries.length;
}

/** Minutes after local midnight of the first log, for each day that has logs. */
export function firstLogMinutes(entries) {
  const map = new Map();
  for (const e of entries) {
    const d = new Date(e.timestamp);
    const k = dayKey(d);
    const m = d.getHours() * 60 + d.getMinutes();
    if (!map.has(k) || m < map.get(k)) map.set(k, m);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, minutes]) => ({ key, minutes }));
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function lateShare(entries, hour = 21) {
  const total = entries.reduce((a, e) => a + entryMg(e), 0);
  if (!total) return 0;
  const late = entries.filter((e) => new Date(e.timestamp).getHours() >= hour)
    .reduce((a, e) => a + entryMg(e), 0);
  return late / total;
}

export function fmtMinutes(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')}${ap}`;
}

export function fmtMg(n) {
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
}
