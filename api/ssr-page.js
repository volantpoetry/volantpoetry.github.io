// ============================================================
// FILE: api/ssr-page.js  (volantpoetry.vercel.app — root project)
// ============================================================
// Server-side structured data injection for the two SEO-critical
// page types on the main poetry site:
//
//   1. /store/details.html?id=<id>   -> Schema.org Book JSON-LD
//   2. /poem.html?collection=<c>&slug=<s> -> Poem JSON-LD + title/meta
//
// Mirrors the proven store1 (volantreads) pattern: edge middleware
// (middleware.js) proxies these paths here, carrying the ORIGINAL
// path in the "x-ssr-path" header so canonical/og URLs stay
// correct. Data is fetched from Firestore (Firebase Admin SDK when
// configured, otherwise the keyless public REST endpoint; rules
// allow public reads).
//
// When the entity is missing/or the lookup fails, the untouched
// static HTML is returned and the existing client-side fallback
// (store/book-schema.js, poem.html's loader) still fills it in.
// ============================================================

const fs = require('fs');
const path = require('path');
const { loadAdmin, db } = require('./../lib/store-admin.js');

const CLOUD_NAME = 'dzoq4pgjn';
const PROJECT_ID = 'silent-depth';
const DOMAIN = 'volantpoetry.vercel.app';

const BOOK_TARGET = '<script type="application/ld+json" id="structured-data-book"></script>';

const REST_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const firestoreDocUrl = (docPath) => `${REST_BASE}/${docPath}`;

// ===== helpers =====

function formatDate(value) {
  if (value === undefined || value === null) return null;
  try {
    let date;
    if (typeof value.toDate === 'function') {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      date = new Date(ms);
    } else if (typeof value === 'string' && value.trim() !== '') {
      date = new Date(value);
    } else {
      return null;
    }
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch (err) {
    return null;
  }
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeJson(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '-');
}

function pickImage(data) {
  if (data.imageUrl) return data.imageUrl;
  if (data.coverUrl) return data.coverUrl;
  if (data.cloudinaryImageId) {
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${data.cloudinaryImageId}`;
  }
  return null;
}

// ===== Firestore REST (proto JSON) -> plain object =====

function decodeProtoValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('mapValue' in v) return decodeProtoMap(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeProtoValue);
  return null;
}

function decodeProtoMap(fields) {
  const out = {};
  for (const key of Object.keys(fields)) out[key] = decodeProtoValue(fields[key]);
  return out;
}

// ===== Firestore fetchers (Admin SDK first, REST fallback) =====

async function fetchDoc(docPath) {
  try {
    loadAdmin();
    const snap = await db().doc(docPath).get();
    if (snap.exists) return snap.data();
  } catch (err) {
    // fall through to the public REST endpoint
  }
  try {
    const res = await fetch(firestoreDocUrl(docPath));
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.fields) return null;
    return decodeProtoMap(body.fields);
  } catch (err) {
    return null;
  }
}

async function fetchBook(bookId) {
  return fetchDoc(`books/${encodeURIComponent(bookId)}`);
}

async function fetchUser(uid) {
  return fetchDoc(`users/${encodeURIComponent(uid)}`);
}

async function queryPoemBySlug(collectionName, slug) {
  try {
    const res = await fetch(`${REST_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collectionName }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'slug' },
              op: 'EQUAL',
              value: { stringValue: slug }
            }
          },
          limit: 2
        }
      })
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = arr.find((r) => r.document && r.document.fields);
    if (hit) return decodeProtoMap(hit.document.fields);
  } catch (err) {
    // fall through
  }
  return null;
}

async function listCollection(collectionName, max = 2000) {
  const out = [];
  try {
    loadAdmin();
    const snap = await db().collection(collectionName).limit(max).get();
    snap.forEach((d) => out.push(d.data()));
    return out;
  } catch (err) {
    // fall through to REST
  }
  try {
    let url = `${REST_BASE}/${encodeURIComponent(collectionName)}?pageSize=300`;
    for (let i = 0; i < Math.ceil(max / 300); i++) {
      const res = await fetch(url);
      if (!res.ok) break;
      const body = await res.json();
      for (const doc of body.documents || []) out.push(decodeProtoMap(doc.fields));
      if (out.length >= max) break;
      if (body.nextPageToken) {
        url = `${REST_BASE}/${encodeURIComponent(collectionName)}?pageSize=300&pageToken=${encodeURIComponent(body.nextPageToken)}`;
      } else {
        break;
      }
    }
  } catch (err) {
    return [];
  }
  return out;
}

// Mirrors poem.html loadPoem: compare = data.slug || slugify(data.title)
async function findPoem(collectionName, slug) {
  const bySlug = await queryPoemBySlug(collectionName, slug);
  if (bySlug) return bySlug;
  const poems = await listCollection(collectionName);
  const match = poems.find((p) => (p.slug || slugify(p.title)) === slug);
  return match || null;
}

// ===== Book schema (mirrors store1/api/ssr-book.js) =====

function buildBookSchema(data, bookId, protocol, host) {
  const pageUrl = `${protocol}://${host}/store/details.html?id=${encodeURIComponent(bookId)}`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    '@id': pageUrl,
    'url': pageUrl,
    'name': data.title,
    'bookFormat': 'https://schema.org/EBook',
    'availability': 'https://schema.org/InStock',
    'inLanguage': data.languageCode || data.language || 'en',
    'publisher': {
      '@type': 'Organization',
      'name': 'Volant Foundry',
      'url': 'https://volantfoundry.vercel.app/'
    }
  };

  const image = pickImage(data);
  if (image) schema.image = image;

  const author = {
    '@type': 'Person',
    'name': data.authorName || data.author || 'Anonymous'
  };
  if (data.authorPoetryProfile) author.sameAs = data.authorPoetryProfile;
  schema.author = author;

  const datePublished = formatDate(data.publishDate || data.publishedAt || data.createdAt || data.approvedAt);
  if (datePublished) schema.datePublished = datePublished;

  const description = data.summary || data.description;
  if (description) schema.description = description;

  if (data.isbn13) schema.isbn = data.isbn13;

  const ratingValue = data.ratingValue || (data.rating && data.rating.value);
  const reviewCount = data.reviewCount || (data.rating && data.rating.count);
  if (Number(ratingValue) > 0 && Number(reviewCount) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': Number(ratingValue),
      'reviewCount': Number(reviewCount)
    };
  }

  const price = (data.pricing && data.pricing.amount !== undefined && data.pricing.amount !== null)
    ? data.pricing.amount
    : data.price;
  if (price !== undefined && price !== null && price !== '') {
    schema.offers = {
      '@type': 'Offer',
      'price': price,
      'priceCurrency': (data.pricing && data.pricing.currency) || data.currency || 'GHS'
    };
  }

  return schema;
}

// ===== Poem rendering =====

function buildPoemSchema(poem, authorName, collectionName, slug, protocol, host) {
  const pageUrl = `${protocol}://${host}/poem.html?collection=${encodeURIComponent(collectionName)}&slug=${encodeURIComponent(slug)}`;
  const datePublished = formatDate(poem.createdAt) || new Date().toISOString().slice(0, 10);
  const description = `Read "${poem.title || 'Poem'}" by ${authorName} on Volant Poetry. A beautiful poem.`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Poem',
    'name': poem.title || 'Poem',
    'author': {
      '@type': 'Person',
      'name': authorName
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'Volant Poetry',
      'url': 'https://volantpoetry.vercel.app'
    },
    'inLanguage': 'en',
    'url': pageUrl,
    'datePublished': datePublished,
    'description': description
  };
}

function renderPoemHtml(html, poem, authorName, collectionName, slug, protocol, host) {
  const title = poem.title || 'Poem';
  const normalizedAuthor = authorName || poem.author || 'Anonymous';
  const fullTitle = `${title} by ${normalizedAuthor} | Volant Poetry`;
  const pageUrl = `${protocol}://${host}/poem.html?collection=${encodeURIComponent(collectionName)}&slug=${encodeURIComponent(slug)}`;
  const description = `Read "${title}" by ${normalizedAuthor} on Volant Poetry. A beautiful poem${Array.isArray(poem.categories) && poem.categories.length ? ` exploring ${poem.categories.join(', ')}` : ''}.`;

  const eTitle = escapeHtml(fullTitle);
  const eDesc = escapeHtml(description);
  const eUrl = escapeHtml(pageUrl);

  const schema = buildPoemSchema(poem, normalizedAuthor, collectionName, slug, protocol, host);
  const schemaJson = safeJson(schema);

  let out = html;

  const replacements = [
    ['<title id="dynamicTitle">Poem | Volant Poetry</title>', `<title id="dynamicTitle">${eTitle}</title>`],
    ['<meta name="description" id="metaDescription" content="Read a beautiful poem on Volant Poetry. Discover inspiring poetry from talented poets around the world." />', `<meta name="description" id="metaDescription" content="${eDesc}" />`],
    ['<link rel="canonical" id="canonicalLink" href="https://volantpoetry.vercel.app/poem.html" />', `<link rel="canonical" id="canonicalLink" href="${eUrl}" />`],
    ['<meta property="og:title" id="ogTitle" content="Poem | Volant Poetry" />', `<meta property="og:title" id="ogTitle" content="${eTitle}" />`],
    ['<meta property="og:description" id="ogDescription" content="Discover inspiring poetry at Volant Poetry. Read poems from talented poets, share your thoughts, and connect with the poetry community." />', `<meta property="og:description" id="ogDescription" content="${eDesc}" />`],
    ['<meta property="og:url" id="ogUrl" content="https://volantpoetry.vercel.app/poem.html" />', `<meta property="og:url" id="ogUrl" content="${eUrl}" />`],
    ['<meta name="twitter:title" id="twitterTitle" content="Poem | Volant Poetry" />', `<meta name="twitter:title" id="twitterTitle" content="${eTitle}" />`],
    ['<meta name="twitter:description" id="twitterDescription" content="Discover inspiring poetry at Volant Poetry. Read, share, and connect with poets." />', `<meta name="twitter:description" id="twitterDescription" content="${eDesc}" />`]
  ];

  for (const [from, to] of replacements) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }

  const schemaBlock = `<script type="application/ld+json" id="poemSchema">\n${schemaJson}\n</script>`;
  out = out.replace(/<script type="application\/ld\+json" id="poemSchema">[\s\S]*?<\/script>/, schemaBlock);

  return out;
}

// ===== Handler =====

module.exports = async (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;

  const originalPath = req.headers['x-ssr-path'] || req.url || '';
  const url = new URL(originalPath, `${protocol}://${host}`);
  const pathname = url.pathname;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');

  if (pathname === '/poem.html') {
    const collectionName = url.searchParams.get('collection') || 'recentPoems';
    const slug = url.searchParams.get('slug');

    let html;
    try {
      html = fs.readFileSync(path.join(process.cwd(), 'poem.html'), 'utf8');
    } catch (err) {
      return res.status(500).send('poem.html is not bundled with this function (vercel.json includeFiles missing).');
    }

    if (!slug) return res.status(200).send(html);

    const poem = await findPoem(collectionName, slug);
    if (poem) {
      let authorName = poem.author || 'Anonymous';
      if (poem.authorId) {
        const userData = await fetchUser(poem.authorId);
        if (userData && userData.username) authorName = userData.username;
      }
      html = renderPoemHtml(html, poem, authorName, collectionName, slug, protocol, host);
    }

    return res.status(200).send(html);
  }

  if (pathname === '/store/details.html') {
    let html;
    try {
      html = fs.readFileSync(path.join(process.cwd(), 'store', 'details.html'), 'utf8');
    } catch (err) {
      return res.status(500).send('store/details.html is not bundled with this function (vercel.json includeFiles missing).');
    }

    const bookId = url.searchParams.get('id');
    if (bookId) {
      const data = await fetchBook(bookId);
      if (data && data.status === 'approved') {
        const json = safeJson(buildBookSchema(data, bookId, protocol, host));
        html = html.split(BOOK_TARGET).join(
          `<script type="application/ld+json" id="structured-data-book">\n${json}\n</script>`
        );
      }
    }

    return res.status(200).send(html);
  }

  return res.status(200).send('OK');
};