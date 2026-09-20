// ============================================================
// FILE: middleware.js  (volantpoetry.vercel.app — root project)
// ============================================================
// Edge middleware sits outermost in Vercel's request pipeline, so
// it runs BEFORE filesystem lookups and vercel.json rewrites.
//
// For the two SEO-critical dynamic page types it proxies the
// request to the /api/ssr-page serverless function (keeping the
// original URL in the browser), so the initial HTML carries the
// injected structured data:
//   - /store/details.html?id=   -> Schema.org Book JSON-LD
//   - /poem.html?collection=&slug= -> Poem JSON-LD + SEO meta
//
// Requests WITHOUT the required query param fall through to the
// normal static files (client-side JS fills everything in).
// The original URL is forwarded to the function via the
// "x-ssr-path" header so canonical/og URLs stay correct.
//
// Node-free edge runtime: no imports, no dependencies.
// ============================================================

export function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  let shouldProxy = false;
  if (pathname === '/store/details.html') {
    shouldProxy = url.searchParams.has('id');
  } else if (pathname === '/poem.html') {
    shouldProxy = url.searchParams.has('slug');
  }
  if (!shouldProxy) return;

  const target = new URL('/api/ssr-page' + (url.search || ''), request.url);

  const headers = new Headers();
  if (request.headers.get('user-agent')) {
    headers.set('user-agent', request.headers.get('user-agent'));
  }
  headers.set('x-ssr-path', pathname + (url.search || ''));

  return fetch(target, {
    redirect: 'follow',
    headers
  });
}

export default middleware;

export const config = {
  matcher: ['/store/details.html', '/poem.html']
};