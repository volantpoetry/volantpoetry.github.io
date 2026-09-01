// store/sw.js

const CACHE_NAME = 'volant-reads-v5';

const APP_SHELL = [
    './reader.html',
    './pdfjs/web/viewer.html',
    './pdfjs/web/viewer.css',
    './pdfjs/web/viewer.mjs',
    './pdfjs/build/pdf.mjs',
    './pdfjs/build/pdf.worker.mjs'
];

const NO_CACHE_PAGES = [
    'index.html',
    'details.html',
    'dashboard.html',
    'submit.html',
    'profile.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Installing Volant Reads offline shell');

                return cache.addAll(APP_SHELL);
            })
            .catch(error => {
                console.error(
                    '❌ Offline shell installation failed:',
                    error
                );
            })
    );

    self.skipWaiting();
});


self.addEventListener('activate', event => {

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {

                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => {
                            console.log(
                                '🗑️ Removing old cache:',
                                name
                            );

                            return caches.delete(name);
                        })
                );

            })
            .then(() => self.clients.claim())
    );

});


self.addEventListener('fetch', event => {

    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);
    const pathname = url.pathname;


    /*
     * ==========================================
     * 1. OFFLINE PAGE NAVIGATION
     * ==========================================
     */

    if (request.mode === 'navigate') {

        event.respondWith(

            fetch(request)
                .then(response => {

                    /*
                     * Don't automatically cache your
                     * dynamic pages here.
                     */

                    return response;

                })
                .catch(() => {

                    /*
                     * If offline, use cached reader.html
                     */

                    return caches.match('./reader.html')
                        .then(cached => {

                            if (cached) {
                                return cached;
                            }

                            return new Response(
                                'Reader is not available offline.',
                                {
                                    status: 503,
                                    headers: {
                                        'Content-Type': 'text/plain'
                                    }
                                }
                            );

                        });

                })
        );

        return;
    }


    /*
     * ==========================================
     * 2. PDF FILES
     * ==========================================
     */

    if (
        pathname.toLowerCase().endsWith('.pdf') ||
        url.searchParams.get('download') === 'pdf'
    ) {

        event.respondWith(

            caches.match(request)
                .then(cached => {

                    if (cached) {
                        console.log(
                            '📖 Serving cached PDF:',
                            url.href
                        );

                        return cached;
                    }

                    return fetch(request)
                        .then(response => {

                            if (
                                response &&
                                response.ok
                            ) {

                                const copy =
                                    response.clone();

                                caches.open(CACHE_NAME)
                                    .then(cache => {
                                        cache.put(
                                            request,
                                            copy
                                        );
                                    });

                            }

                            return response;

                        });

                })
                .catch(() => {

                    return new Response(
                        'Book not available offline.',
                        {
                            status: 503,
                            headers: {
                                'Content-Type':
                                    'text/plain'
                            }
                        }
                    );

                })
        );

        return;
    }


    /*
     * ==========================================
     * 3. PDF.JS + STATIC FILES
     * ==========================================
     */

    const isStaticAsset =
        pathname.endsWith('.css') ||
        pathname.endsWith('.js') ||
        pathname.endsWith('.mjs') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.jpeg') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.webp') ||
        pathname.endsWith('.woff') ||
        pathname.endsWith('.woff2');


    if (isStaticAsset) {

        event.respondWith(

            caches.match(request)
                .then(cached => {

                    if (cached) {
                        return cached;
                    }

                    return fetch(request)
                        .then(response => {

                            if (
                                response &&
                                response.ok
                            ) {

                                const copy =
                                    response.clone();

                                caches.open(CACHE_NAME)
                                    .then(cache => {
                                        cache.put(
                                            request,
                                            copy
                                        );
                                    });
                            }

                            return response;

                        });

                })
                .catch(() => {

                    return new Response(
                        'Resource not available offline.',
                        {
                            status: 503,
                            headers: {
                                'Content-Type':
                                    'text/plain'
                            }
                        }
                    );

                })
        );

        return;
    }


    /*
     * ==========================================
     * 4. EVERYTHING ELSE
     * ==========================================
     */

    event.respondWith(

        caches.match(request)
            .then(cached => {

                if (cached) {
                    return cached;
                }

                return fetch(request);

            })
            .catch(() => {

                return new Response(
                    'Content not available offline.',
                    {
                        status: 503,
                        headers: {
                            'Content-Type':
                                'text/plain'
                        }
                    }
                );

            })

    );

});
