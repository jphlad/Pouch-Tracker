// Backup / restore helpers. mergeImport and toCSV are pure (unit tested).
import { entryMg } from './stats.js';

export const EXPORT_VERSION = 1;

export function buildExport({ products, entries, settings }) {
  return {
    app: 'pouch-tracker',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    products, entries, settings,
  };
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a valid backup file.');
  if (!Array.isArray(obj.entries) || !Array.isArray(obj.products)) throw new Error('Backup is missing entries or products.');
  for (const e of obj.entries) {
    if (!e.id || !e.timestamp || isNaN(new Date(e.timestamp))) throw new Error('Backup has a malformed entry.');
  }
  return true;
}

/** Merge a backup into current data by id. Backup wins on conflicts. */
export function mergeImport(current, backup) {
  validateImport(backup);
  const merge = (a, b) => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const x of b) map.set(x.id, x);
    return [...map.values()];
  };
  return {
    products: merge(current.products || [], backup.products),
    entries: merge(current.entries || [], backup.entries)
      .sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp)),
    settings: { ...(current.settings || {}), ...(backup.settings || {}) },
  };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(entries, products) {
  const pmap = new Map(products.map((p) => [p.id, p]));
  const rows = [['timestamp', 'local_date', 'local_time', 'brand', 'line', 'flavor', 'nicotine_source', 'mg_per_pouch', 'count', 'total_mg', 'context', 'note']];
  for (const e of [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
    const p = pmap.get(e.productId) || {};
    const d = new Date(e.timestamp);
    rows.push([
      e.timestamp,
      d.toLocaleDateString('en-CA'),
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      p.brand, p.line, p.flavor, p.nicotineSource || '', e.mgPerPouch, e.count, entryMg(e), e.context, e.note || '',
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** Share a file via the iOS share sheet when possible, else trigger a download. */
export async function shareOrDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: mime }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
