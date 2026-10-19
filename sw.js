// ים אל ים — Service Worker (offline-first for the app shell)
// - the page itself, manifest, Firebase SDK and fonts are cached so the app opens with NO connection
// - HTML/same-origin files: network-first with a short timeout (poor reception on the trail -> fall back to cache fast)
// - fonts + Firebase SDK: cache-first, refreshed in the background
// - Firestore / weather API requests are never intercepted (the app handles those offline itself)
// Bump VERSION whenever this file changes so old caches are cleaned up.

const VERSION = 'v5';
const CORE = 'ye-core-' + VERSION;
const RUNTIME = 'ye-runtime-' + VERSION;
const CORE_URLS = ['./', './index.html', './manifest.json'];
const CDN_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

function withTimeout(promise, ms){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const core = await caches.open(CORE);
    await Promise.all(CORE_URLS.map(async u => { try { await core.add(new Request(u, {cache: 'reload'})); } catch (_) {} }));
    const rt = await caches.open(RUNTIME);
    await Promise.all(CDN_URLS.map(async u => { try { const r = await fetch(u, {mode: 'no-cors'}); await rt.put(u, r); } catch (_) {} }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CORE && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function navigate(req){
  try {
    const res = await withTimeout(fetch(req), 4000);
    if (res && res.ok) { const c = await caches.open(CORE); c.put('./index.html', res.clone()).catch(() => {}); }
    return res;
  } catch (_) {
    return (await caches.match(req, {ignoreSearch: true})) ||
           (await caches.match('./index.html')) ||
           (await caches.match('./')) ||
           Response.error();
  }
}

async function networkFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), 5000);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (_) {
    return (await cache.match(req)) || Response.error();
  }
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) return cached;
  return (await update) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/firestore\.googleapis\.com|firebaseio\.com|open-meteo\.com|identitytoolkit|securetoken/.test(url.hostname)) return;

  if (req.mode === 'navigate') { event.respondWith(navigate(req)); return; }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'www.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req)); return;
  }
  if (url.origin === self.location.origin) { event.respondWith(networkFirst(req, CORE)); return; }
});
