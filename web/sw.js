/* sw.js — device-side caching policy.
 *
 * Strict split, per the PoliGo storage rules:
 *  - cache-first (immutable, on-device): app shell, seed endpoints, and every
 *    Python-rendered animation clip. The server streams a clip once; all later
 *    playbacks come from this cache.
 *  - network-first with cache fallback: user data reads (profile, tasks,
 *    scans) so journeys still open offline.
 *  - never cached: writes (POST/PATCH/DELETE).
 */
const VERSION = 'poligo-v15';
const SHELL = VERSION + '-shell';
const DATA = VERSION + '-data';

const PRECACHE = [
  '/', '/index.html', '/styles/app.css',
  '/js/icons.js', '/js/store.js', '/js/globe.js', '/js/stage.js', '/js/term.js', '/js/app.js',
  '/vendor/d3-array.min.js', '/vendor/d3-geo.min.js', '/data/countries.geo.json', '/assets/icon.svg',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // writes always hit the network
  const url = new URL(req.url);

  // animation clips + immutable static assets: cache-first (the globe's libraries and map data too, so it works offline)
  if (url.pathname.startsWith('/anim/') || url.pathname.startsWith('/icons/') ||
      url.pathname.startsWith('/data/') || url.pathname.startsWith('/styles/') ||
      url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/js/') || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }

  // seed endpoints: cache-first, refreshed when the network responds
  if (url.pathname === '/api/universities' || url.pathname === '/api/home-courses') {
    e.respondWith(cacheFirst(req, DATA));
    return;
  }

  // user data reads: network-first, fall back to cache offline
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(req, DATA));
  }
});

async function cacheFirst(req, store) {
  const cache = await caches.open(store);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, store) {
  const cache = await caches.open(store);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
