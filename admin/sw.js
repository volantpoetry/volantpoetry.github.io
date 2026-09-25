// admin/sw.js — Volant Admin service worker (offline app shell + cached static assets).
var CACHE = 'volant-admin-v4';
var PRECACHE = [
  'app.html',
  'admin.html',
  'admin-login.html',
  'admin-ops.js',
  'return-url-handler.js',
  'images/logo.png',
  'images/app-icon-192.png',
  'images/app-icon-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(PRECACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE).then(function(c) { c.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req).then(function(m) { return m || caches.match('app.html'); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(cached) {
      return cached || fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE).then(function(c) { c.put(req, copy); });
        return res;
      });
    })
  );
});