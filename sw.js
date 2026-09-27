// Bumping this string is the single switch that makes every returning user pick
// up a brand new shell: the activate handler below deletes every cache whose
// name is not exactly this value, so the old copies cannot be served again.
const CACHE = 'volant-poetry-v17';

// Every cache name shipped by an earlier deployment. activate already removes
// anything that is not the current CACHE, so this list is belt-and-braces, but
// it also records what has shipped and survives a future rename.
const RETIRED_CACHES = [
  'volant-poetry-v1',  'volant-poetry-v2',  'volant-poetry-v3',
  'volant-poetry-v4',  'volant-poetry-v5',  'volant-poetry-v6',
  'volant-poetry-v7',  'volant-poetry-v8',  'volant-poetry-v9',
  'volant-poetry-v10', 'volant-poetry-v11', 'volant-poetry-v12',
  'volant-poetry-v13', 'volant-poetry-v14', 'volant-poetry-v15',
  'volant-poetry-v16'
];

const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/theme.js',
  '/script.js',
  '/manifest.json',
  '/poems.html',
  '/poem.html',
  '/poem-of-the-week.html',
  '/quote-of-the-week.html',
  '/category.html',
  '/user-profile.html',
  '/shared/like-toggle.js',
  '/individual.html',
  '/all-categories.html',
  '/submitpoems.html',
  '/submission-guidelines.html',
  '/notifications.html',
  '/messages.html',
  '/personal/',
  '/personal/index.html',
  '/icon/icon-192.png',
  '/icon/icon-512.png'
];

// --- Offline shell dependencies -------------------------------------------
// poems.html / poem.html import the Firebase SDK as ES modules from
// www.gstatic.com. A service worker cannot intercept a module graph it never
// cached, so without these three files the page cannot even boot offline and
// no amount of HTML precaching helps. Cached separately because a cross-origin
// hiccup must not abort the same-origin precache below.
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'
];

// Hosts whose assets are served cache-first so typography and the SDK survive
// offline, then quietly refreshed in the background when the network returns.
const OFFLINE_HOSTS = [
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

const NETWORK_FIRST_PATHS = [
  '/manifest.json',
  '/shared/',
  '/personal/'
];
const BYPASS_CACHE_PATHS = [
  '/icon/icon-192.png',
  '/icon/icon-512.png'
];

function isCacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

// Serve from cache immediately, refresh in the background. This is what makes
// the SDK and webfonts both available offline and current once reconnected.
function staleWhileRevalidate(request) {
  return caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        if (isCacheable(response)) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(() => null);

    if (cached) return cached;
    const fresh = await network;
    if (fresh) return fresh;
    throw new Error('Offline and not cached: ' + request.url);
  });
}

// Background task: revalidate everything we hold for the offline hosts, so a
// poem reader who reconnects overnight gets today's fonts and SDK.
async function revalidateOfflineHosts() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const targets = keys.filter((r) => OFFLINE_HOSTS.includes(new URL(r.url).hostname));
  await Promise.allSettled(targets.map((r) =>
    fetch(r).then((response) => {
      if (isCacheable(response)) return cache.put(r, response);
    }).catch(() => {})
  ));
}

// Caches owned by the other apps sharing this origin. The store runs at /store/
// under its own worker (store/sw.js) and keeps readers' downloaded books in
// 'volant-reads-pdfs'. The admin panel runs at /admin/ under admin/sw.js. This
// worker is scoped to the whole origin, so without this list a version bump here
// would also erase the store's offline shell, the admin panel's shell, and every
// book a reader had downloaded.
const PROTECTED_PREFIXES = [
  'volant-store-', 'volant-store1-', 'volant-reads-', 'volant-admin-'
];

// Deletes every cache that is not the one this version of the worker owns, and
// never touches another app's caches. This is what actually stops a returning
// user from being served yesterday's files: a new CACHE name is created empty
// and filled from the network, and every previous version is dropped in the
// same pass.
async function purgeStaleCaches() {
  const names = await caches.keys();
  const stale = names.filter((n) =>
    n !== CACHE && !PROTECTED_PREFIXES.some((p) => n.startsWith(p))
  );
  if (stale.length === 0) return [];
  await Promise.all(stale.map((n) => caches.delete(n).catch(() => false)));
  console.log('[sw] removed superseded caches:', stale.join(', '));
  return stale;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Reclaim space from earlier versions before adding anything, so a user
    // with several stale copies does not briefly hold two full shells.
    await purgeStaleCaches();

    const cache = await caches.open(CACHE);

    // cache: 'reload' is the important detail. Without it the browser is free to
    // satisfy these requests from its own HTTP disk cache, so a returning user
    // can "update" into a brand new cache that is full of the OLD html/css/js
    // and never see this deployment at all.
    // allSettled rather than addAll: one missing file must not abort the rest.
    const results = await Promise.allSettled(
      PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))
    );
    const failed = PRECACHE.filter((_, i) => results[i].status === 'rejected');
    if (failed.length) {
      console.warn('[sw] precache misses:', failed.join(', '));
    }

    // Cached separately from the precache above because a cross-origin hiccup
    // must not take the same-origin shell down with it.
    await Promise.allSettled(
      FIREBASE_SDK.map((url) =>
        cache.add(new Request(url, { mode: 'cors', credentials: 'omit', cache: 'reload' }))
      )
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Runs again here because install's cleanup happens before this worker owns
    // the scope, and a previous version may have re-created a cache in between.
    await purgeStaleCaches();
    await Promise.all(RETIRED_CACHES.map((n) => caches.delete(n).catch(() => false)));

    // Take over open tabs immediately, otherwise users would keep running the
    // old page until they happened to close every tab.
    await self.clients.claim();

    // Periodic Background Sync is a bonus, not a requirement: Chrome only grants
    // it to installed PWAs, so an ordinary browser tab always fails here. That is
    // the expected outcome, not a fault, so it is logged at debug level (hidden
    // unless the console is set to Verbose) and the one-shot `sync` tag below
    // covers everyone else.
    if (!('periodicSync' in self.registration)) return;
    return self.registration.periodicSync
      .register('poem-refresh', { minInterval: 12 * 60 * 60 * 1000 })
      .catch((err) => {
        if (err && err.name === 'NotAllowedError') {
          console.debug('Periodic sync not granted (expected unless the app is installed).');
          return;
        }
        console.warn('Periodic sync unavailable:', err);
      });
  })());
});

// Lets a page ask the waiting worker to take over without a full reload cycle.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'poem-refresh') event.waitUntil(revalidateOfflineHosts());
});

// Catch-up for browsers that granted Background Sync but not Periodic Sync.
self.addEventListener('sync', (event) => {
  if (event.tag === 'poem-refresh') event.waitUntil(revalidateOfflineHosts());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) {
    // Previously every cross-origin request was dropped here, which meant the
    // Firebase SDK and webfonts were never cached and poems.html could not boot
    // offline at all. Now these hosts get cache-first with a background refresh.
    if (OFFLINE_HOSTS.includes(url.hostname)) {
      event.respondWith(staleWhileRevalidate(request).catch(() => fetch(request)));
    }
    return;
  }

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