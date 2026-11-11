// IndexedDB storage. Everything is loaded into memory on launch (the data is small),
// and every change is written through to IndexedDB without blocking the UI.

const DB_NAME = 'pouch-tracker';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

export const DEFAULT_CONTEXTS = ['Working', 'Studying', 'Sitting around', 'After a meal', 'Social / Drinking', 'Driving', 'Other'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const getAll = (store) => open().then((db) => new Promise((resolve, reject) => {
  const r = db.transaction(store).objectStore(store).getAll();
  r.onsuccess = () => resolve(r.result || []);
  r.onerror = () => reject(r.error);
}));

const getKV = (key) => open().then((db) => new Promise((resolve, reject) => {
  const r = db.transaction('kv').objectStore('kv').get(key);
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
}));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
  Date.now().toString(36) + Math.random().toString(36).slice(2));

export const state = { products: [], entries: [], settings: null };

function defaultSettings() {
  return {
    schemaVersion: SCHEMA_VERSION,
    defaultProductId: null,
    contexts: DEFAULT_CONTEXTS.map((name) => ({ name, hidden: false })),
    lastBackupAt: null,
    dismissed: {},
    createdAt: new Date().toISOString(),
  };
}

function seedProducts() {
  const now = new Date().toISOString();
  return [
    { id: uid(), brand: 'Velo', line: 'Plus', flavor: 'Spearmint', mg: 9, nicotineSource: 'synthetic', isFavorite: true, archived: false, createdAt: now },
    { id: uid(), brand: 'ZYN', line: 'Ultra', flavor: 'Fresh Spearmint', mg: 11, nicotineSource: 'natural', isFavorite: true, archived: false, createdAt: now },
  ];
}

function migrate(settings) {
  // future schema migrations go here, keyed on settings.schemaVersion
  const s = { ...defaultSettings(), ...settings };
  if (Array.isArray(s.contexts) && typeof s.contexts[0] === 'string') {
    s.contexts = s.contexts.map((name) => ({ name, hidden: false }));
  }
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

export async function load() {
  try { await navigator.storage?.persist?.(); } catch {}
  const [products, entries, settings] = await Promise.all([getAll('products'), getAll('entries'), getKV('settings')]);
  state.entries = entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  state.products = products;
  if (!settings) {
    state.settings = defaultSettings();
    if (!products.length) {
      state.products = seedProducts();
      state.settings.defaultProductId = state.products[0].id;
      await Promise.all(state.products.map(putProduct));
    }
    await saveSettings();
  } else {
    state.settings = migrate(settings);
  }
  return state;
}

export const putProduct = (p) => tx('products', 'readwrite', (s) => s.put(p));
export const saveSettings = () => tx('kv', 'readwrite', (s) => s.put(state.settings, 'settings'));

export function addEntry(e) {
  state.entries.push(e);
  state.entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return tx('entries', 'readwrite', (s) => s.put(e));
}

export function updateEntry(e) {
  const i = state.entries.findIndex((x) => x.id === e.id);
  if (i >= 0) state.entries[i] = e;
  state.entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return tx('entries', 'readwrite', (s) => s.put(e));
}

export function deleteEntry(id) {
  state.entries = state.entries.filter((x) => x.id !== id);
  return tx('entries', 'readwrite', (s) => s.delete(id));
}

export function upsertProduct(p) {
  const i = state.products.findIndex((x) => x.id === p.id);
  if (i >= 0) state.products[i] = p; else state.products.push(p);
  return putProduct(p);
}

export function deleteProduct(id) {
  state.products = state.products.filter((x) => x.id !== id);
  return tx('products', 'readwrite', (s) => s.delete(id));
}

export async function replaceAll({ products, entries, settings }) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['products', 'entries', 'kv'], 'readwrite');
    const ps = t.objectStore('products'), es = t.objectStore('entries');
    ps.clear(); es.clear();
    products.forEach((p) => ps.put(p));
    entries.forEach((e) => es.put(e));
    t.objectStore('kv').put(migrate(settings), 'settings');
    t.oncomplete = resolve; t.onerror = () => reject(t.error);
  });
  state.products = products;
  state.entries = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  state.settings = migrate(settings);
}

export const productById = (id) => state.products.find((p) => p.id === id);
export const activeProducts = () => state.products.filter((p) => !p.archived)
  .sort((a, b) => (b.id === state.settings?.defaultProductId) - (a.id === state.settings?.defaultProductId) || String(a.createdAt).localeCompare(String(b.createdAt)));
