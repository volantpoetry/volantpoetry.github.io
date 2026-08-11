```javascript
/**
 * 🔥 Auto Sitemap Generator for Volant Poetry
 *
 * Generates:
 *   1. Static HTML pages
 *   2. Dynamic Firestore poem URLs
 *
 * Dynamic poem example:
 * https://volantpoetry.vercel.app/poem.html?collection=recentPoems&slug=what-do-i-have-to-do-with-love-
 *
 * Runs on GitHub Actions.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// ============================================================
// CONFIG
// ============================================================

const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';

// Your Firebase project ID.
// Prefer setting this in GitHub Actions:
//
// FIREBASE_PROJECT_ID
//
// Example:
// FIREBASE_PROJECT_ID: volant-poetry
//
const firebaseProjectId =
  process.env.FIREBASE_PROJECT_ID || '';

// Public Firestore collections containing poems.
const poemCollections = [
  'recentPoems'
];

// ============================================================
// EXCLUDED STATIC PAGES
// ============================================================

const excludedPages = [
  'admin',
  'dashboard',
  'manage',
  'editor',
  'login',
  'signup',
  'reset',
  'verify',
  'comment',
  'draft',
  'test',
  'user',
  'approvals',
  'universal-login',
  'universal-signup',

  'assign-images.html',
  'poemcount.html',

  // Do NOT add the generic poem.html page.
  // Individual Firestore poems are added separately.
  'poem.html',

  'addcategories.html',
  'Select-Poem-of-the-Week.html',
  'existingVerify.html',
  'check-verification.html',
  'list-files.py',
  'update-folder-resources.py'
];

// ============================================================
// EXCLUDED FOLDERS
// ============================================================

const excludedFolders = [
  'admin',
  'api',
  'node_modules',
  '.git',
  '.vscode',
  '.continue',
  'backup',
  'backups_clean_urls'
];

// ============================================================
// EXCLUSION HELPER
// ============================================================

function isExcluded(file) {
  const fileParts = file.split(/[\\/]/);

  for (const folder of excludedFolders) {
    if (fileParts.includes(folder)) {
      return true;
    }
  }

  return excludedPages.some(function (excluded) {
    return file.toLowerCase().includes(
      excluded.toLowerCase()
    );
  });
}

// ============================================================
// XML ESCAPE
// ============================================================

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================
// URL PATH
// ============================================================

function getUrlWithHtml(filePath) {
  let cleanPath = filePath;

  cleanPath = cleanPath.replace(/^\.\//, '');

  // index.html at root
  if (cleanPath === 'index.html') {
    return '';
  }

  // store/index.html -> store/
  if (cleanPath.endsWith('/index.html')) {
    return cleanPath.replace(
      /\/index\.html$/,
      '/'
    );
  }

  return cleanPath;
}

// ============================================================
// SCAN FOLDER
// ============================================================

function scanFolderForHTML(folder) {
  for (const excluded of excludedFolders) {
    if (
      folder.includes(excluded) ||
      folder === excluded
    ) {
      return [];
    }
  }

  const pattern = folder + '/*.html';

  return glob.sync(pattern, {
    cwd: publicFolder
  });
}

// ============================================================
// STATIC PAGES
// ============================================================

function getStaticPages() {
  const rootFiles = glob.sync('*.html', {
    cwd: publicFolder
  });

  const subFolders = [
    'store',
    'shared',
    'volant_foundry'
  ];

  let subFolderFiles = [];

  for (const folder of subFolders) {
    const files = scanFolderForHTML(folder);

    subFolderFiles =
      subFolderFiles.concat(files);
  }

  const allFiles = [
    ...rootFiles,
    ...subFolderFiles
  ];

  return allFiles
    .filter(function (file) {
      return !isExcluded(file);
    })
    .map(function (file) {
      const filePath =
        path.join(publicFolder, file);

      const stats =
        fs.statSync(filePath);

      const lastmod =
        stats.mtime.toISOString();

      const urlPath =
        getUrlWithHtml(file);

      let url;

      if (urlPath === '') {
        url = domain;
      } else {
        url = domain + '/' + urlPath;
      }

      let priority = '0.8';
      let changefreq = 'monthly';

      // Homepage
      if (
        file === 'index.html' ||
        urlPath === '' ||
        urlPath === 'store/'
      ) {
        priority = '1.0';
        changefreq = 'daily';
      }

      // Important pages
      else if (
        file === 'poems.html' ||
        file === 'submission-guidelines.html' ||
        file === 'submitpoems.html' ||
        file.includes('store/details.html')
      ) {
        priority = '0.9';
        changefreq = 'weekly';
      }

      // Shared pages
      else if (file.startsWith('shared/')) {
        priority = '0.6';
        changefreq = 'monthly';
      }

      // Store
      else if (file.startsWith('store/')) {
        priority = '0.7';
        changefreq = 'weekly';
      }

      // Volant Foundry
      else if (
        file.startsWith('volant_foundry/')
      ) {
        priority = '0.8';
        changefreq = 'weekly';
      }

      return {
        loc: url,
        lastmod: lastmod,
        changefreq: changefreq,
        priority: priority,
        type: 'static'
      };
    });
}

// ============================================================
// FIRESTORE VALUE CONVERTER
// ============================================================

function firestoreValueToJs(value) {
  if (!value) {
    return null;
  }

  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.booleanValue !== undefined) {
    return value.booleanValue;
  }

  if (value.integerValue !== undefined) {
    return Number(value.integerValue);
  }

  if (value.doubleValue !== undefined) {
    return Number(value.doubleValue);
  }

  if (value.timestampValue !== undefined) {
    return value.timestampValue;
  }

  if (value.nullValue !== undefined) {
    return null;
  }

  if (value.arrayValue !== undefined) {
    const values =
      value.arrayValue.values || [];

    return values.map(
      firestoreValueToJs
    );
  }

  if (value.mapValue !== undefined) {
    return firestoreFieldsToJs(
      value.mapValue.fields || {}
    );
  }

  return null;
}

// ============================================================
// FIRESTORE FIELDS
// ============================================================

function firestoreFieldsToJs(fields) {
  const result = {};

  Object.keys(fields || {}).forEach(function (key) {
    result[key] =
      firestoreValueToJs(fields[key]);
  });

  return result;
}

// ============================================================
// FIRESTORE REST
// ============================================================

async function fetchFirestoreCollection(
  collectionName
) {
  if (!firebaseProjectId) {
    throw new Error(
      'FIREBASE_PROJECT_ID is not configured.'
    );
  }

  const baseUrl =
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(firebaseProjectId) +
    '/databases/(default)/documents/' +
    encodeURIComponent(collectionName);

  let documents = [];
  let pageToken = '';

  do {
    let url = baseUrl;

    if (pageToken) {
      url +=
        '?pageToken=' +
        encodeURIComponent(pageToken);
    }

    const response =
      await fetch(url);

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        'Firestore API returned ' +
        response.status +
        ': ' +
        body
      );
    }

    const json =
      await response.json();

    if (Array.isArray(json.documents)) {
      documents =
        documents.concat(json.documents);
    }

    pageToken =
      json.nextPageToken || '';

  } while (pageToken);

  return documents;
}

// ============================================================
// PUBLIC POEM CHECK
// ============================================================

function isPublicPoem(data) {
  if (!data) {
    return false;
  }

  if (data.published === false) {
    return false;
  }

  if (data.public === false) {
    return false;
  }

  if (data.isPublic === false) {
    return false;
  }

  if (data.indexable === false) {
    return false;
  }

  if (data.noIndex === true) {
    return false;
  }

  const statusFields = [
    data.status,
    data.publicationStatus,
    data.publishStatus
  ];

  for (const status of statusFields) {
    if (typeof status !== 'string') {
      continue;
    }

    const normalized =
      status.trim().toLowerCase();

    if (
      normalized === 'draft' ||
      normalized === 'private' ||
      normalized === 'unpublished' ||
      normalized === 'rejected' ||
      normalized === 'deleted' ||
      normalized === 'archived'
    ) {
      return false;
    }
  }

  return true;
}

// ============================================================
// LAST MODIFIED
// ============================================================

function getLastModified(data) {
  const fields = [
    'updatedAt',
    'lastModified',
    'modifiedAt',
    'publishedAt',
    'createdAt'
  ];

  for (const field of fields) {
    const value = data[field];

    if (!value) {
      continue;
    }

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

// ============================================================
// CREATE POEM URL
// ============================================================

function createPoemUrl(
  collectionName,
  slug
) {
  return (
    domain +
    '/poem.html?collection=' +
    encodeURIComponent(collectionName) +
    '&slug=' +
    encodeURIComponent(slug)
  );
}

// ============================================================
// GET FIRESTORE POEMS
// ============================================================

async function getFirestorePoemPages() {
  console.log(
    '\n🔥 Reading public poems from Firestore...'
  );

  const poemPages = [];

  for (const collectionName of poemCollections) {
    console.log(
      '\n📚 Collection: ' +
      collectionName
    );

    const documents =
      await fetchFirestoreCollection(
        collectionName
      );

    console.log(
      '   Found ' +
      documents.length +
      ' documents'
    );

    let included = 0;
    let skipped = 0;

    for (const document of documents) {
      const data =
        firestoreFieldsToJs(
          document.fields || {}
        );

      if (!isPublicPoem(data)) {
        skipped++;
        continue;
      }

      const slug =
        typeof data.slug === 'string'
          ? data.slug.trim()
          : '';

      if (!slug) {
        console.warn(
          '   ⚠️ Skipping document without slug: ' +
          document.name
        );

        skipped++;
        continue;
      }

      const loc =
        createPoemUrl(
          collectionName,
          slug
        );

      poemPages.push({
        loc: loc,
        lastmod: getLastModified(data),
        changefreq: 'monthly',
        priority: '0.8',
        type: 'poem'
      });

      included++;
    }

    console.log(
      '   ✅ Included: ' +
      included
    );

    console.log(
      '   🚫 Skipped: ' +
      skipped
    );
  }

  console.log(
    '\n📖 Total Firestore poem URLs: ' +
    poemPages.length
  );

  return poemPages;
}

// ============================================================
// BUILD XML
// ============================================================

function buildXML(urls) {
  const entries = urls.map(function (u) {
    let xml =
      '  <url>\n' +
      '    <loc>' +
      escapeXml(u.loc) +
      '</loc>\n';

    if (u.lastmod) {
      xml +=
        '    <lastmod>' +
        escapeXml(u.lastmod) +
        '</lastmod>\n';
    }

    if (u.changefreq) {
      xml +=
        '    <changefreq>' +
        u.changefreq +
        '</changefreq>\n';
    }

    if (u.priority) {
      xml +=
        '    <priority>' +
        u.priority +
        '</priority>\n';
    }

    xml += '  </url>';

    return xml;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n' +
    entries.join('\n\n') +
    '\n\n</urlset>\n'
  );
}

// ============================================================
// ROBOTS.TXT
// ============================================================

function generateRobotsTxt() {
  const robots =
    '# Robots.txt for Volant Poetry\n\n' +
    'User-agent: *\n' +
    'Allow: /\n\n' +
    '# Sitemap\n' +
    'Sitemap: ' +
    domain +
    '/sitemap.xml\n\n' +
    '# Block admin and private pages\n' +
    'Disallow: /admin/\n' +
    'Disallow: /api/\n' +
    'Disallow: /dashboard/\n' +
    'Disallow: /manage/\n' +
    'Disallow: /editor/\n' +
    'Disallow: /login/\n' +
    'Disallow: /signup/\n' +
    'Disallow: /reset/\n' +
    'Disallow: /verify/\n' +
    'Disallow: /approvals/\n' +
    'Disallow: /universal-login/\n' +
    'Disallow: /universal-signup/\n' +
    'Disallow: /check-verification/\n' +
    'Disallow: /existingVerify/\n' +
    'Disallow: /users-reset/\n' +
    'Disallow: /user-edit-poems/\n' +
    'Disallow: /notifications/\n' +
    'Disallow: /messages/\n';

  fs.writeFileSync(
    path.join(
      publicFolder,
      'robots.txt'
    ),
    robots,
    'utf8'
  );

  console.log(
    '✅ robots.txt generated'
  );
}

// ============================================================
// REMOVE DUPLICATES
// ============================================================

function removeDuplicates(urls) {
  const unique = [];
  const seen = new Set();

  for (const item of urls) {
    if (!item || !item.loc) {
      continue;
    }

    if (!seen.has(item.loc)) {
      seen.add(item.loc);
      unique.push(item);
    }
  }

  return unique;
}

// ============================================================
// MAIN
// ============================================================

async function generateSitemap() {
  try {
    console.log(
      '🧠 Generating SEO sitemap...'
    );

    console.log(
      '📁 Domain: ' +
      domain
    );

    console.log(
      '🔗 Static URLs: .html'
    );

    console.log(
      '📖 Dynamic URLs: Firestore poems'
    );

    // --------------------------------------------------------
    // Static pages
    // --------------------------------------------------------

    const staticPages =
      getStaticPages();

    console.log(
      '📄 Static URLs found: ' +
      staticPages.length
    );

    // --------------------------------------------------------
    // Firestore poems
    // --------------------------------------------------------

    const poemPages =
      await getFirestorePoemPages();

    // --------------------------------------------------------
    // Combine
    // --------------------------------------------------------

    const allPages = [
      ...staticPages,
      ...poemPages
    ];

    // --------------------------------------------------------
    // Deduplicate
    // --------------------------------------------------------

    const unique =
      removeDuplicates(allPages);

    console.log(
      '\n📊 Total unique URLs: ' +
      unique.length
    );

    // --------------------------------------------------------
    // Write sitemap
    // --------------------------------------------------------

    const xml =
      buildXML(unique);

    fs.writeFileSync(
      path.join(
        publicFolder,
        'sitemap.xml'
      ),
      xml,
      'utf8'
    );

    console.log(
      '✅ sitemap.xml generated successfully!'
    );

    // --------------------------------------------------------
    // Robots
    // --------------------------------------------------------

    generateRobotsTxt();

    // --------------------------------------------------------
    // Statistics
    // --------------------------------------------------------

    const staticCount =
      unique.filter(function (u) {
        return u.type === 'static';
      }).length;

    const poemCount =
      unique.filter(function (u) {
        return u.type === 'poem';
      }).length;

    console.log(
      '\n📊 Sitemap Statistics:'
    );

    console.log(
      '   Total URLs: ' +
      unique.length
    );

    console.log(
      '   Static pages: ' +
      staticCount
    );

    console.log(
      '   Firestore poems: ' +
      poemCount
    );

    console.log(
      '   Priority 1.0: ' +
      unique.filter(function (u) {
        return u.priority === '1.0';
      }).length
    );

    console.log(
      '   Priority 0.9: ' +
      unique.filter(function (u) {
        return u.priority === '0.9';
      }).length
    );

    console.log(
      '   Priority 0.8: ' +
      unique.filter(function (u) {
        return u.priority === '0.8';
      }).length
    );

    console.log(
      '   Priority 0.7: ' +
      unique.filter(function (u) {
        return u.priority === '0.7';
      }).length
    );

    console.log(
      '   Priority 0.6: ' +
      unique.filter(function (u) {
        return u.priority === '0.6';
      }).length
    );

    // --------------------------------------------------------
    // Sample poem URLs
    // --------------------------------------------------------

    console.log(
      '\n📖 Sample poem URLs:'
    );

    const samples =
      unique
        .filter(function (u) {
          return u.type === 'poem';
        })
        .slice(0, 5);

    if (samples.length === 0) {
      console.log(
        '   ⚠️ No Firestore poem URLs generated.'
      );
    } else {
      samples.forEach(function (poem) {
        console.log(
          '   - ' +
          poem.loc
        );
      });
    }

    console.log(
      '\n🎉 Sitemap generation complete!'
    );

  } catch (err) {
    console.error(
      '\n❌ Sitemap generation failed:'
    );

    console.error(err);

    process.exit(1);
  }
}

// ============================================================
// RUN
// ============================================================

generateSitemap();
```
