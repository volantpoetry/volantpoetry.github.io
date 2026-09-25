// store/sw.js
// v7: offline bookstore shell + offline book reading (PDF & EPUB).
const CACHE_NAME = 'volant-reads-v8';
const BOOK_CACHE = 'volant-reads-pdfs';

// Pages that change with the signed-in user and must always hit the network.
const NO_CACHE_PAGES = [
    'dashboard.html',
    'profile.html'
];

// App shell cached at install so the bookstore opens offline even on first launch.
const APP_SHELL = [
    './index.html',
    './details.html',
    './reader.html',
    './library.html',
    './pdfjs/local-viewer.html',
    './pdfjs/pdf.min.js',
    './pdfjs/pdf.worker.min.js',
    './epubjs/epub.min.js',
    './epubjs/jszip.min.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Cross-origin hosts we are allowed to intercept for offline use.
const CROSS_ORIGIN_CACHE = {
    'cdnjs.cloudflare.com': CACHE_NAME,   // font-awesome
    'volantpoetry.vercel.app': CACHE_NAME, // /shared/ + style.css
    'res.cloudinary.com': BOOK_CACHE       // book files + covers
};

function isCacheable(response) {
    // Only whole (200) responses are ever stored so a partial Range 206 can
    // never be mistaken for the full book offline.
    return response && response.status === 200 && (response.type === 'basic' || response.type === 'cors');
}

async function putInCache(cacheName, request, response) {
    try {
        if (!isCacheable(response)) return;
        const copy = response.clone();
        const cache = await caches.open(cacheName);
        await cache.put(request, copy);
    } catch (err) {
        console.warn('SW cache put failed:', err);
    }
}

// Cache-first, then network (falls back to a 503 if offline and uncached).
function cacheFirst(request, cacheName) {
    return caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
            putInCache(cacheName, request, response);
            return response;
        }).catch(() => new Response('Resource not available offline.', { status: 503 }));
    });
}

// Network-first, cache fallback (falls back to a 503 if offline and uncached).
function networkFirst(request, cacheName) {
    return fetch(request).then((response) => {
        putInCache(cacheName, request, response);
        return response;
    }).catch(() => caches.match(request).then((cached) => cached || new Response('Content not available offline.', { status: 503 })));
}

// Navigation: cache that exact URL, fall back to the offline home page.
function navigateFirst(request) {
    return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
    }).catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
        return new Response('Offline', { status: 503 });
    });
}

function isBookUrl(url) {
    return url.hostname === 'res.cloudinary.com' ||
           url.pathname.toLowerCase().endsWith('.pdf') ||
           url.pathname.toLowerCase().endsWith('.epub');
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .catch(err => {
                console.warn('⚠️ App shell cache partial:', err);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME && name !== BOOK_CACHE)
                    .map(name => {
                        console.log('🗑️ Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).catch(err => console.warn('SW activate cleanup error:', err))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    const url = new URL(event.request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;
    const request = event.request;

    // --- Book files (PDF/EPUB/covers, same- or cross-origin): network-first,
    // --- cache-first from the dedicated book cache when offline. ---
    if (isBookUrl(url)) {
        event.respondWith(networkFirst(request, BOOK_CACHE));
        return;
    }

    // --- Allowed cross-origin hosts: cache-first with network update. ---
    const crossCache = CROSS_ORIGIN_CACHE[hostname];
    if (crossCache) {
        event.respondWith(cacheFirst(request, crossCache));
        return;
    }

    // Other cross-origin: leave to the browser.
    if (url.origin !== self.location.origin) {
        return;
    }

    // Pages that should NEVER be cached (signed-in / private views)
    const isNoCachePage = NO_CACHE_PAGES.some(page => pathname.endsWith(page));

    if (isNoCachePage) {
        event.respondWith(fetch(request));
        return;
    }

    // --- Page navigations: cache each URL under its own key ---
    if (request.mode === 'navigate') {
        event.respondWith(navigateFirst(request));
        return;
    }

    // --- Static assets: cache-first with network update. ---
    const isStaticAsset = pathname.includes('.css') ||
                          pathname.includes('.js') ||
                          pathname.includes('.mjs') ||
                          pathname.includes('.png') ||
                          pathname.includes('.jpg') ||
                          pathname.includes('.jpeg') ||
                          pathname.includes('.svg') ||
                          pathname.includes('.webp') ||
                          pathname.includes('.woff') ||
                          pathname.includes('.woff2') ||
                          pathname.includes('.ttf') ||
                          pathname.includes('.eot') ||
                          pathname.includes('.ico') ||
                          pathname.includes('.json');

    if (isStaticAsset) {
        event.respondWith(cacheFirst(request, CACHE_NAME));
        return;
    }

    // Everything else - network first with cache fallback
    event.respondWith(networkFirst(request, CACHE_NAME));
});