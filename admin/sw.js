// admin/sw.js — Volant Admin service worker (offline app shell + cached static assets).
//
// v5. This worker is scoped to /admin/, but CacheStorage is shared with every
// other worker on this origin: the Poetry app and the Reads store both run here
// too. v4 deleted every cache that was not its own, so simply opening the admin
// panel wiped the Poetry offline shell and every book a reader had downloaded.
// Cleanup is now limited to the caches this app owns, and the precache always
// bypasses the browser's HTTP disk cache so a redeploy is actually picked up.
var CACHE_PREFIX = 'volant-admin-';
var CACHE = CACHE_PREFIX + 'v5';

// Prefixes belonging to the other apps on this origin. Never touched.
var PROTECTED_PREFIXES = ['volant-poetry-', 'volant-store-', 'volant-store1-', 'volant-reads-'];

var PRECACHE = [
  './app.html',
  './admin.html',
  './admin-login.html',
  './admin-ops.js',
  './return-url-handler.js',
  './images/logo.png',
  './images/app-icon-192.png',
  './images/app-icon-512.png'
];

function isCacheable(res) {
  return res && (res.status === 200 || res.type === 'opaque');
}

// Always look inside one named cache. A global caches.match() would happily
// return a copy of the request that belongs to another app on this origin.
function matchIn(name, req) {
  return caches.open(name)
    .then(function(cache) { return cache.match(req); })
    .catch(function() { return undefined; });
}

function putInCache(req, res) {
  if (!isCacheable(res)) return;
  var copy = res.clone();
  caches.open(CACHE).then(function(cache) { return cache.put(req, copy); }).catch(function() {});
}

// Drops only the admin caches this version replaces. The previous version
// deleted everything that was not its own, which is what took the Poetry and
// store caches down with it.
function purgeStaleCaches() {
  return caches.keys().then(function(keys) {
    var stale = keys.filter(function(name) {
      if (name === CACHE) return false;
      if (name.indexOf(CACHE_PREFIX) !== 0) return false;
      for (var i = 0; i < PROTECTED_PREFIXES.length; i++) {
        if (name.indexOf(PROTECTED_PREFIXES[i]) === 0) return false;
      }
      return true;
    });

    if (!stale.length) return [];

    return Promise.all(stale.map(function(name) {
      return caches.delete(name).catch(function() { return false; });
    })).then(function() {
      console.log('[admin sw] removed superseded caches:', stale.join(', '));
      return stale;
    });
  }).catch(function(err) {
    console.warn('[admin sw] cleanup failed:', err);
    return [];
  });
}

self.addEventListener('install', function(e) {
  e.waitUntil(
    // Reclaim the previous versions before filling the new cache, so an admin
    // never sees files from an older deployment.
    purgeStaleCaches().then(function() {
      return caches.open(CACHE);
    }).then(function(cache) {
      // cache: 'reload' is the important part. Without it the browser is free to
      // satisfy these from its own HTTP disk cache, so the worker can "update"
      // into a brand new cache full of the OLD html/js and the change is never
      // seen. Each entry is caught individually so one missing file cannot abort
      // the rest of the shell.
      return Promise.all(PRECACHE.map(function(url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function(err) {
          console.warn('[admin sw] precache miss:', url, err);
        });
      }));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    // Runs again here because install's cleanup happens before this worker owns
    // the scope, and an older version may have re-created a cache in between.
    purgeStaleCaches().then(function() {
      // Take over open tabs immediately, otherwise the panel would keep running
      // the previous deployment's JavaScript until every tab was closed.
      return self.clients.claim();
    })
  );
});

// Lets a page hand over to the waiting worker without a full reload cycle.
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function(res) {
        putInCache(req, res);
        return res;
      }).catch(function() {
        return matchIn(CACHE, req).then(function(hit) {
          return hit || matchIn(CACHE, './app.html');
        });
      })
    );
    return;
  }

  e.respondWith(
    matchIn(CACHE, req).then(function(cached) {
      if (cached) return cached;
      return fetch(req).then(function(res) {
        putInCache(req, res);
        return res;
      });
    })
  );
});
