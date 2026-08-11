/**
 * 🔥 Auto Sitemap Generator for Volant Poetry / Volant Foundry
 *
 * Generates:
 * 1. Static .html URLs
 * 2. Dynamic Firestore poem URLs:
 *    /poem.html?collection=recentPoems&slug=...
 *
 * Runs on GitHub Actions.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const admin = require('firebase-admin');

// ============================================================
// CONFIG
// ============================================================

const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';

// ------------------------------------------------------------
// Firestore collections containing PUBLIC poems
// ------------------------------------------------------------
//
// Add other PUBLIC poem collections here if needed.
//
// Example:
// const poemCollections = [
//   'recentPoems',
//   'classicPoems',
//   'featuredPoems'
// ];
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
  // The bare /poem.html page is excluded from static discovery.
  // Individual Firestore poem URLs are added separately below.
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
// FIREBASE INITIALIZATION
// ============================================================

function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  /**
   * Recommended GitHub Actions setup:
   *
   * Add this GitHub secret:
   *
   * FIREBASE_SERVICE_ACCOUNT_JSON
   *
   * containing the complete Firebase service-account JSON.
   */

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      console.log('🔥 Firebase initialized using FIREBASE_SERVICE_ACCOUNT_JSON');

      return admin.firestore();

    } catch (error) {
      console.error(
        '❌ Could not parse FIREBASE_SERVICE_ACCOUNT_JSON:',
        error.message
      );

      throw error;
    }
  }

  /**
   * Alternative:
   *
   * GOOGLE_APPLICATION_CREDENTIALS
   *
   * can point to a service-account JSON file.
   */

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });

    console.log(
      '🔥 Firebase initialized using GOOGLE_APPLICATION_CREDENTIALS'
    );

    return admin.firestore();
  }

  throw new Error(
    'Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_JSON ' +
    'or GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

// ============================================================
// XML ESCAPING
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
// URL ENCODING
// ============================================================

function createPoemUrl(collectionName, slug) {
  if (!collectionName || !slug) {
    return null;
  }

  const encodedCollection = encodeURIComponent(collectionName);
  const encodedSlug = encodeURIComponent(slug);

  return (
    `${domain}/poem.html` +
    `?collection=${encodedCollection}` +
    `&slug=${encodedSlug}`
  );
}

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
// GET URL WITH .HTML EXTENSION
// ============================================================

function getUrlWithHtml(filePath) {
  let cleanPath = filePath;

  // Remove leading ./ if present
  cleanPath = cleanPath.replace(/^\.\//, '');

  // Root index.html
  if (cleanPath === 'index.html') {
    return '';
  }

  // Subfolder index.html
  // Example:
  // store/index.html -> store/
  if (cleanPath.endsWith('/index.html')) {
    return cleanPath.replace(/\/index\.html$/, '/');
  }

  // Keep .html extension
  return cleanPath;
}

// ============================================================
// SCAN FOLDER FOR HTML
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
    subFolderFiles = subFolderFiles.concat(files);
  }

  const allFiles = [
    ...rootFiles,
    ...subFolderFiles
  ];

  return allFiles
    .filter(file => !isExcluded(file))
    .map(file => {
      const filePath = path.join(
        publicFolder,
        file
      );

      const stats = fs.statSync(filePath);

      const lastmod = stats.mtime.toISOString();

      const urlPath = getUrlWithHtml(file);

      let url;

      if (urlPath === '') {
        url = domain;
      } else {
        url = `${domain}/${urlPath}`;
      }

      // Default
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

      else if (file.startsWith('shared/')) {
        priority = '0.6';
        changefreq = 'monthly';
      }

      // --------------------------------------------------------
      // Store
      // --------------------------------------------------------

      else if (file.startsWith('store/')) {
        priority = '0.7';
        changefreq = 'weekly';
      }

      // --------------------------------------------------------
      // Volant Foundry
      // --------------------------------------------------------

      else if (file.startsWith('volant_foundry/')) {
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
// DETERMINE WHETHER FIRESTORE POEM IS PUBLIC
// ============================================================

function isPublicPoem(data) {
  if (!data) {
    return false;
  }

  /**
   * If your Firestore documents don't contain any of these
   * fields, the poem is considered public by default.
   *
   * If one of these fields exists, we use it to prevent
   * drafts/private/unpublished poems entering the sitemap.
   */

  // Explicit boolean flags
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

  // Common status fields
  const statusFields = [
    data.status,
    data.publicationStatus,
    data.publishStatus
  ];

  for (const status of statusFields) {
    if (typeof status !== 'string') {
      continue;
    }

    const normalized = status
      .trim()
      .toLowerCase();

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
// FIRESTORE DATE HELPER
// ============================================================

function getFirestoreDate(data) {
  /**
   * Try common Firestore date fields.
   *
   * We prefer updatedAt because it represents the latest
   * meaningful change to the poem.
   */

  const possibleFields = [
    'updatedAt',
    'lastModified',
    'modifiedAt',
    'publishedAt',
    'createdAt'
  ];

  for (const field of possibleFields) {
    const value = data[field];

    if (!value) {
      continue;
    }

    // Firestore Timestamp
    if (
      typeof value === 'object' &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate().toISOString();
    }

    // JavaScript Date
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Milliseconds
    if (typeof value === 'number') {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    // ISO string
    if (typeof value === 'string') {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return null;
}

// ============================================================
// FIRESTORE POEM PAGES
// ============================================================

async function getFirestorePoemPages() {
  const db = initializeFirebase();

  const poemPages = [];

  console.log('\n🔥 Reading poems from Firestore...');

  for (const collectionName of poemCollections) {
    try {
      console.log(
        `📚 Reading collection: ${collectionName}`
      );

      const snapshot = await db
        .collection(collectionName)
        .get();

      console.log(
        `   Found ${snapshot.size} documents`
      );

      let included = 0;
      let skipped = 0;

      for (const doc of snapshot.docs) {
        const data = doc.data();

        // ------------------------------------------------------
        // Only public/indexable poems
        // ------------------------------------------------------

        if (!isPublicPoem(data)) {
          skipped++;
          continue;
        }

        // ------------------------------------------------------
        // Get slug
        // ------------------------------------------------------

        const slug =
          typeof data.slug === 'string'
            ? data.slug.trim()
            : '';

        if (!slug) {
          console.warn(
            `⚠️ Skipping ${collectionName}/${doc.id}: no slug`
          );

          skipped++;
          continue;
        }

        // ------------------------------------------------------
        // Build dynamic poem URL
        // ------------------------------------------------------

        const url = createPoemUrl(
          collectionName,
          slug
        );

        if (!url) {
          skipped++;
          continue;
        }

        // ------------------------------------------------------
        // Firestore last modified date
        // ------------------------------------------------------

        const lastmod = getFirestoreDate(data);

        poemPages.push({
          loc: url,
          lastmod,
          changefreq: 'monthly',
          priority: '0.8',
          type: 'poem',
          collection: collectionName,
          documentId: doc.id,
          slug
        });

        included++;
      }

      console.log(
        `   ✅ Included: ${included}`
      );

      console.log(
        `   🚫 Skipped: ${skipped}`
      );

    } catch (error) {
      console.error(
        `❌ Error reading Firestore collection "${collectionName}":`,
        error.message
      );

      throw error;
    }
  }

  console.log(
    `📖 Total Firestore poem URLs: ${poemPages.length}`
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
    ${u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : ''}
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ''}
    ${u.priority ? `<priority>${u.priority}</priority>` : ''}
  </url>
`).join('')}

</urlset>`;
}

// ============================================================
// GENERATE ROBOTS.TXT
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
    path.join(publicFolder, 'robots.txt'),
    robots,
    'utf8'
  );

  console.log('✅ robots.txt generated');
}

// ============================================================
// DEDUPLICATE URLS
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
      '🔗 Static pages: .html URLs'
    );

    console.log(
      '📖 Dynamic pages: Firestore poems'
    );

    // --------------------------------------------------------
    // Static HTML pages
    // --------------------------------------------------------

    const staticPages = getStaticPages();

    console.log(
      `📄 Static URLs found: ${staticPages.length}`
    );

    // --------------------------------------------------------
    // Firestore poem pages
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
    // Remove duplicates
    // --------------------------------------------------------

    const unique =
      removeDuplicates(allPages);

    console.log(
      `\n📊 Total unique URLs: ${unique.length}`
    );

    // --------------------------------------------------------
    // Build sitemap
    // --------------------------------------------------------

    const xml = buildXML(unique);

    fs.writeFileSync(
      path.join(publicFolder, 'sitemap.xml'),
      xml,
      'utf8'
    );

    console.log(
      '✅ sitemap.xml generated successfully!'
    );

    // --------------------------------------------------------
    // Generate robots.txt
    // --------------------------------------------------------

    generateRobotsTxt();

    // --------------------------------------------------------
    // Statistics
    // --------------------------------------------------------

    const staticCount =
      unique.filter(
        u => u.type === 'static'
      ).length;

    const poemCount =
      unique.filter(
        u => u.type === 'poem'
      ).length;

    console.log('\n📊 Sitemap Statistics:');

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
    // Sample poem URLs
    // --------------------------------------------------------

    console.log('\n📖 Sample Firestore poem URLs:');

    const samplePoems = unique
      .filter(u => u.type === 'poem')
      .slice(0, 5);

    if (samplePoems.length === 0) {
      console.log(
        '   ⚠️ No Firestore poem URLs were generated.'
      );
    } else {
      for (const poem of samplePoems) {
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
      err
    );

    process.exit(1);
  }
}

// ============================================================
// RUN
// ============================================================

generateSitemap();
