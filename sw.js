// Trail Trainer — Service Worker
// אסטרטגיה: Network-first (תמיד מנסה לגרוף גרסה טרייה מהרשת),
// עם נפילה לגרסה השמורה ב-cache אם אין רשת (מצב אופליין).
// skipWaiting + clients.claim -> עדכונים נכנסים לתוקף מיד, בלי צורך לסגור את הדפדפן.

const CACHE_NAME = 'trail-trainer-v1';
const URLS_TO_CACHE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
