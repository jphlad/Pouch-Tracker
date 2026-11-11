// Offline-first service worker. Bump VERSION on every deploy that changes files.
const VERSION = 'v3';
const CACHE = `pouch-tracker-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/stats.js',
  'js/health.js',
  'js/io.js',
  'data/health-cards.json',
  'data/pouch-library.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pouch-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first (instant + offline), refresh the cache in the background.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      return res || (req.mode === 'navigate' ? cache.match('index.html') : new Response('', { status: 504 }));
    })
  );
});
