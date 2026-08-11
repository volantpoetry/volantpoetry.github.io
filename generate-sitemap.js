```js
/**
 * 🔥 Auto Sitemap Generator for Volant Poetry / Volant Foundry
 *
 * GENERATES:
 *   1. Static .html URLs
 *   2. Dynamic Firestore poem URLs
 *
 * Example:
 *   https://volantpoetry.vercel.app/poem.html?collection=recentPoems&slug=what-do-i-have-to-do-with-love-
 *
 * Runs on GitHub Actions.
 *
 * IMPORTANT:
 * This version does NOT use Firebase Admin credentials.
 * It reads publicly accessible Firestore documents through
 * the Firestore REST API.
 */

// ============================================================
// DEPENDENCIES
// ============================================================

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// ============================================================
// CONFIG
// ============================================================

const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';

// ------------------------------------------------------------
// Firebase project ID
// ------------------------------------------------------------
//
// OPTION 1:
// Set this in GitHub Actions:
//
// FIREBASE_PROJECT_ID: your-project-id
//
// OPTION 2:
// Replace the empty string below with your Firebase project ID.
//
// Do NOT put a service-account JSON here.
//
const firebaseProjectId =
  process.env.FIREBASE_PROJECT_ID || '';

// ------------------------------------------------------------
// Public Firestore collections containing poems
// ------------------------------------------------------------
//
// Add your other PUBLIC poem collections here if they exist.
//
// Example:
// [
//   'recentPoems',
//   'classicPoems',
//   'featuredPoems'
// ]
//
const poemCollections = [
  'recentPoems'
];

// ============================================================
// BLOCKED / NO-INDEX STATIC PAGES
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

  // IMPORTANT:
  // Exclude the generic poem.html page from static discovery.
  //
  // Individual Firestore poem URLs are added separately.
  //
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

  return excludedPages.some(ex =>
    file.toLowerCase().includes(ex.toLowerCase())
  );
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
// URL WITH .HTML
// ============================================================

function getUrlWithHtml(filePath) {
  let cleanPath = filePath;

  cleanPath = cleanPath.replace(/^\.\//, '');

  // Root index.html
  if (cleanPath === 'index.html') {
    return '';
  }

  // Subfolder index.html
  //
  // store/index.html -> store/
  //
  if (cleanPath.endsWith('/index.html')) {
    return cleanPath.replace(/\/index\.html$/, '/');
  }

  return cleanPath;
}

// ============================================================
// SCAN HTML FOLDER
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

  const pattern = `${folder}/*.html`;

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
    .filter(file => !isExcluded(file))
    .map(file => {
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
        url = `${domain}/${urlPath}`;
      }

      // --------------------------------------------------------
      // Defaults
      // --------------------------------------------------------

      let priority = '0.8';
      let changefreq = 'monthly';

      // --------------------------------------------------------
      // Homepage
      // --------------------------------------------------------

      if (
        file === 'index.html' ||
        urlPath === '' ||
        urlPath === 'store/'
      ) {
        priority = '1.0';
        changefreq = 'daily';
      }

      // --------------------------------------------------------
      // Important content
      // --------------------------------------------------------

      else if (
        file === 'poems.html' ||
        file === 'submission-guidelines.html' ||
        file === 'submitpoems.html' ||
        file.includes('store/details.html')
      ) {
        priority = '0.9';
        changefreq = 'weekly';
      }

      // --------------------------------------------------------
      // Shared pages
      // --------------------------------------------------------

      else if (
        file.startsWith('shared/')
      ) {
        priority = '0.6';
        changefreq = 'monthly';
      }

      // --------------------------------------------------------
      // Store
      // --------------------------------------------------------

      else if (
        file.startsWith('store/')
      ) {
        priority = '0.7';
        changefreq = 'weekly';
      }

      // --------------------------------------------------------
      // Volant Foundry
      // --------------------------------------------------------

      else if (
        file.startsWith('volant_foundry/')
      ) {
        priority = '0.8';
        changefreq = 'weekly';
      }

      return {
        loc: url,
        lastmod,
        changefreq,
        priority,
        type: 'static'
      };
    });
}

// ============================================================
// FIRESTORE VALUE CONVERTER
// ============================================================
//
// Firestore REST returns values like:
//
// {
//   "stringValue": "hello"
// }
//
// or:
//
// {
//   "timestampValue": "2026-08-11T..."
// }
//
// This converts them into normal JavaScript values.
//

function firestoreValueToJs(value) {
  if (!value) {
    return null;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'stringValue'
    )
  ) {
    return value.stringValue;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'booleanValue'
    )
  ) {
    return value.booleanValue;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'integerValue'
    )
  ) {
    return Number(value.integerValue);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'doubleValue'
    )
  ) {
    return Number(value.doubleValue);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'timestampValue'
    )
  ) {
    return value.timestampValue;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'nullValue'
    )
  ) {
    return null;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'arrayValue'
    )
  ) {
    const values =
      value.arrayValue.values || [];

    return values.map(
      firestoreValueToJs
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      'mapValue'
    )
  ) {
    const fields =
      value.mapValue.fields || {};

    return firestoreFieldsToJs(fields);
  }

  return null;
}

// ============================================================
// FIRESTORE FIELD CONVERTER
// ============================================================

function firestoreFieldsToJs(fields) {
  const result = {};

  for (const [key, value] of Object.entries(fields || {})) {
    result[key] =
      firestoreValueToJs(value);
  }

  return result;
}

// ============================================================
// FIRESTORE REST FETCH
// ============================================================

async function fetchFirestoreCollection(
  collectionName
) {
  if (!firebaseProjectId) {
    throw new Error(
      'Firebase project ID is missing. ' +
      'Set FIREBASE_PROJECT_ID in GitHub Actions ' +
      'or put your Firebase project ID in the script.'
    );
  }

  const baseUrl =
    `https://firestore.googleapis.com/v1/projects/` +
    `${encodeURIComponent(firebaseProjectId)}` +
    `/databases/(default)/documents/` +
    `${encodeURIComponent(collectionName)}`;

  let documents = [];
  let nextPageToken = '';

  do {
    const url =
      nextPageToken
        ? `${baseUrl}?pageToken=${encodeURIComponent(nextPageToken)}`
        : baseUrl;

    console.log(
      `   🔎 Fetching Firestore: ${collectionName}`
    );

    const response =
      await fetch(url);

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `Firestore request failed (${response.status}): ${body}`
      );
    }

    const json =
      await response.json();

    if (Array.isArray(json.documents)) {
      documents =
        documents.concat(json.documents);
    }

    nextPageToken =
      json.nextPageToken || '';

  } while (nextPageToken);

  return documents;
}

// ============================================================
// PUBLIC POEM CHECK
// ============================================================

function isPublicPoem(data) {
  if (!data) {
    return false;
  }

  // Explicit negative flags
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

  // Status fields
  const statuses = [
    data.status,
    data.publicationStatus,
    data.publishStatus
  ];

  for (const status of statuses) {
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
// FIRESTORE LAST MODIFIED
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

    const date =
      new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

// ============================================================
// POEM URL
// ============================================================

function createPoemUrl(
  collectionName,
  slug
) {
  return (
    `${domain}/poem.html` +
    `?collection=${encodeURIComponent(collectionName)}` +
    `&slug=${encodeURIComponent(slug)}`
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

  for (
    const collectionName of poemCollections
  ) {
    console.log(
      `\n📚 Collection: ${collectionName}`
    );

    const documents =
      await fetchFirestoreCollection(
        collectionName
      );

    console.log(
      `   Found ${documents.length} documents`
    );

    let included = 0;
    let skipped = 0;

    for (const document of documents) {
      const fields =
        firestoreFieldsToJs(
          document.fields || {}
        );

      // --------------------------------------------------------
      // Public/indexable check
      // --------------------------------------------------------

      if (!isPublicPoem(fields)) {
        skipped++;
        continue;
      }

      // --------------------------------------------------------
      // Slug
      // --------------------------------------------------------

      const slug =
        typeof fields.slug === 'string'
          ? fields.slug.trim()
          : '';

      if (!slug) {
        console.warn(
          `   ⚠️ Skipping document without slug: ${document.name}`
        );

        skipped++;
        continue;
      }

      // --------------------------------------------------------
      // URL
      // --------------------------------------------------------

      const loc =
        createPoemUrl(
          collectionName,
          slug
        );

      // --------------------------------------------------------
      // Last modified
      // --------------------------------------------------------

      const lastmod =
        getLastModified(fields);

      poemPages.push({
        loc,
        lastmod,
        changefreq: 'monthly',
        priority: '0.8',
        type: 'poem'
      });

      included++;
    }

    console.log(
      `   ✅ Included: ${included}`
    );

    console.log(
      `   🚫 Skipped: ${skipped}`
    );
  }

  console.log(
    `\n📖 Total Firestore poem URLs: ${poemPages.length}`
  );

  return poemPages;
}

// ============================================================
// BUILD XML
// ============================================================

function buildXML(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls.map(u => `
  <url>
    <loc>${escapeXml(u.loc)}</loc>
    ${u.lastmod
      ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>`
      : ''}
    ${u.changefreq
      ? `<changefreq>${u.changefreq}</changefreq>`
      : ''}
    ${u.priority
      ? `<priority>${u.priority}</priority>`
      : ''}
  </url>
`).join('')}

</urlset>`;
}

// ============================================================
// ROBOTS.TXT
// ============================================================

function generateRobotsTxt() {
  const robots = `# Robots.txt for Volant Poetry

User-agent: *
Allow: /

# Sitemap
Sitemap: ${domain}/sitemap.xml

# Block admin and private pages
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard/
Disallow: /manage/
Disallow: /editor/
Disallow: /login/
Disallow: /signup/
Disallow: /reset/
Disallow: /verify/
Disallow: /approvals/
Disallow: /universal-login/
Disallow: /universal-signup/
Disallow: /check-verification/
Disallow: /existingVerify/
Disallow: /users-reset/
Disallow: /user-edit-poems/
Disallow: /notifications/
Disallow: /messages/
`;

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
      `📁 Domain: ${domain}`
    );

    console.log(
      '🔗 Static URLs: .html'
    );

    console.log(
      '📖 Dynamic URLs: Firestore poems'
    );

    // --------------------------------------------------------
    // STATIC
    // --------------------------------------------------------

    const staticPages =
      getStaticPages();

    console.log(
      `📄 Static URLs found: ${staticPages.length}`
    );

    // --------------------------------------------------------
    // FIRESTORE
    // --------------------------------------------------------

    const poemPages =
      await getFirestorePoemPages();

    // --------------------------------------------------------
    // COMBINE
    // --------------------------------------------------------

    const allPages = [
      ...staticPages,
      ...poemPages
    ];

    // --------------------------------------------------------
    // DEDUPLICATE
    // --------------------------------------------------------

    const unique =
      removeDuplicates(allPages);

    console.log(
      `\n📊 Total unique URLs: ${unique.length}`
    );

    // --------------------------------------------------------
    // WRITE SITEMAP
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
    // ROBOTS
    // --------------------------------------------------------

    generateRobotsTxt();

    // --------------------------------------------------------
    // STATISTICS
    // --------------------------------------------------------

    const staticCount =
      unique.filter(
        u => u.type === 'static'
      ).length;

    const poemCount =
      unique.filter(
        u => u.type === 'poem'
      ).length;

    console.log(
      '\n📊 Sitemap Statistics:'
    );

    console.log(
      `   Total URLs: ${unique.length}`
    );

    console.log(
      `   Static pages: ${staticCount}`
    );

    console.log(
      `   Firestore poems: ${poemCount}`
    );

    console.log(
      `   Priority 1.0: ${
        unique.filter(
          u => u.priority === '1.0'
        ).length
      }`
    );

    console.log(
      `   Priority 0.9: ${
        unique.filter(
          u => u.priority === '0.9'
        ).length
      }`
    );

    console.log(
      `   Priority 0.8: ${
        unique.filter(
          u => u.priority === '0.8'
        ).length
      }`
    );

    console.log(
      `   Priority 0.7: ${
        unique.filter(
          u => u.priority === '0.7'
        ).length
      }`
    );

    console.log(
      `   Priority 0.6: ${
        unique.filter(
          u => u.priority === '0.6'
        ).length
      }`
    );

    // --------------------------------------------------------
    // SAMPLE POEMS
    // --------------------------------------------------------

    console.log(
      '\n📖 Sample poem URLs:'
    );

    const samples =
      unique
        .filter(
          u => u.type === 'poem'
        )
        .slice(0, 5);

    if (samples.length === 0) {
      console.log(
        '   ⚠️ No Firestore poem URLs generated.'
      );
    } else {
      for (const poem of samples) {
        console.log(
          `   - ${poem.loc}`
        );
      }
    }

    console.log(
      '\n🎉 Sitemap generation complete!'
    );

  } catch (err) {
    console.error(
      '\n❌ Sitemap generation failed:',
      err.message
    );

    process.exit(1);
  }
}

// ============================================================
// RUN
// ============================================================

generateSitemap();
```
