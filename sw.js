const CACHE = 'volant-poetry-v7';
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/poems.html',
  '/poem.html',
  '/poem-of-the-week.html',
  '/quote-of-the-week.html',
  '/category.html',
  '/individual.html',
  '/all-categories.html',
  '/submitpoems.html',
  '/submission-guidelines.html',
  '/notifications.html',
  '/messages.html',
  '/icon/icon-192.png',
  '/icon/icon-512.png'
];

const NETWORK_FIRST_PATHS = [
  '/manifest.json',
  '/shared/'
];
const BYPASS_CACHE_PATHS = [
  '/icon/icon-192.png',
  '/icon/icon-512.png'
];

function isCacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((err) => console.warn('Precache was partial:', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // --- Page navigations: cache each URL under ITS OWN key so a user
  // who opens a page while online can return to THAT page offline. ---
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response) && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          if (hit) return hit;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return caches.match('/');
        })
    );
    return;
  }

  const pathname = url.pathname;
  if (NETWORK_FIRST_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    event.respondWith(
      fetch(request).then((response) => {
        if (isCacheable(response)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch((err) => caches.match(request).then((cached) => cached || Promise.reject(err)))
    );
    return;
  }

  if (BYPASS_CACHE_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (isCacheable(response)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});