/**
 * 🔥 Auto Sitemap Generator for Volant Foundry (SEO CLEAN VERSION)
 * EXCLUDES: admin folder, approvals.html, universal auth files, api folder
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ---- CONFIG ----
const domain = 'https://volantpoetry.vercel.app';  // ✅ UPDATED to Vercel
const publicFolder = './';
const firebaseKeyPath = './serviceAccountKey.json';

// 🚫 BLOCKED / NO-INDEX PAGES
const excludedPages = [
  // Admin pages
  'admin', 'dashboard', 'manage', 'editor',
  'login', 'signup', 'reset', 'verify',
  'comment', 'draft', 'test', 'user',
  
  // Store pages to exclude
  'approvals',  // ❌ Exclude approvals.html in store folder
  
  // Universal auth pages (root and shared)
  'universal-login',  // ❌ Exclude universal-login.html
  'universal-signup', // ❌ Exclude universal-signup.html
  
  // Other exclusions
  'assign-images.html',
  'poemcount.html',
  'poem.html',
  'addcategories.html',
  'Select-Poem-of-the-Week.html',
  'existingVerify.html',
  'check-verification.html'
];

// 🚫 EXCLUDED FOLDERS (entire folders)
const excludedFolders = [
  'admin',     // ❌ Entire admin folder
  'api'        // ❌ Entire api folder (serverless functions)
];

// ---- Firebase ----
let db = null;
let firebaseInitialized = false;

try {
  if (fs.existsSync(firebaseKeyPath)) {
    const serviceAccount = require(firebaseKeyPath);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    firebaseInitialized = true;
    console.log('✅ Firebase initialized');
  } else {
    console.warn('⚠️ serviceAccountKey.json not found, skipping Firebase');
  }
} catch (err) {
  console.warn('⚠️ Firebase init failed:', err.message);
}

// ---- Exclusion helper ----
function isExcluded(file) {
  // Check if file is in excluded folders
  const fileParts = file.split(/[\/\\]/);
  for (const folder of excludedFolders) {
    if (fileParts.includes(folder)) {
      return true;
    }
  }
  
  // Check if file matches excluded pages
  return excludedPages.some(ex =>
    file.toLowerCase().includes(ex.toLowerCase())
  );
}

// ---- Helper to scan multiple folders ----
function scanFolderForHTML(folder) {
  // Skip excluded folders
  for (const excluded of excludedFolders) {
    if (folder.includes(excluded) || folder === excluded) {
      return [];
    }
  }
  
  const pattern = `${folder}/*.html`;
  return glob.sync(pattern, { cwd: publicFolder });
}

// ---- Safe image path builder ----
function getImagesForFolder(folder) {
  // Skip if folder is excluded
  for (const excluded of excludedFolders) {
    if (folder.includes(excluded) || folder === excluded) {
      return [];
    }
  }
  
  const folderPath = path.join(publicFolder, folder);

  if (!fs.existsSync(folderPath)) return [];

  const files = glob.sync('**/*.*', { cwd: folderPath });

  return files.map(f =>
    `${domain}/${folder}/${f.replace(/\\/g, '/')}`
      .replace(/\/+/g, '/')
      .replace(':/', '://')
  );
}

// ---- Static pages (root + subfolders) ----
function getStaticPages() {
  // Scan root for HTML files
  const rootFiles = glob.sync('*.html', { cwd: publicFolder });
  
  // Scan subfolders for HTML files (store, shared, volant_foundry)
  const subFolders = ['store', 'shared', 'volant_foundry'];
  let subFolderFiles = [];
  
  for (const folder of subFolders) {
    const files = scanFolderForHTML(folder);
    subFolderFiles = subFolderFiles.concat(files);
  }

  const allFiles = [...rootFiles, ...subFolderFiles];

  return allFiles
    .filter(file => !isExcluded(file))
    .map(file => {
      const filePath = path.join(publicFolder, file);
      const stats = fs.statSync(filePath);

      const lastmod = stats.mtime.toISOString();

      // Determine image folder based on file location
      const fileDir = path.dirname(file);
      const fileName = path.basename(file, '.html');
      
      let imageFolder;
      if (file === 'index.html' || file === 'store/index.html') {
        imageFolder = 'images/index';
      } else if (fileDir === '.') {
        imageFolder = `images/${fileName}`;
      } else {
        imageFolder = `images/${fileDir}/${fileName}`;
      }

      return {
        loc: `${domain}/${file}`,
        lastmod,
        changefreq: 'monthly',
        priority: file === 'index.html' || file === 'store/index.html' ? '1.0' : '0.8',
        images: getImagesForFolder(imageFolder)
      };
    });
}

// ---- Poems (priority SEO content) ----
async function getPoemPages() {
  if (!firebaseInitialized || !db) return [];
  
  try {
    const snapshot = await db.collection('recentPoems').get();

    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      const lastmod = data.timestamp
        ? data.timestamp.toDate().toISOString()
        : new Date().toISOString();

      return {
        loc: `${domain}/poems/${docSnap.id}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.9',
        images: getImagesForFolder(`images/poems/${docSnap.id}`)
      };
    });
  } catch (err) {
    console.warn('⚠️ Could not fetch poems:', err.message);
    return [];
  }
}

// ---- Categories (clean URLs only) ----
async function getCategoryPages() {
  if (!firebaseInitialized || !db) return [];
  
  try {
    const snapshot = await db.collection('recentPoems').get();
    const set = new Set();

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (Array.isArray(data.categories)) {
        data.categories.forEach(cat => set.add(cat));
      }
    });

    return [...set].map(cat => ({
      loc: `${domain}/category.html?name=${encodeURIComponent(cat)}`,
      lastmod: new Date().toISOString(),
      changefreq: 'weekly',
      priority: '0.6',
      images: []
    }));
  } catch (err) {
    console.warn('⚠️ Could not fetch categories:', err.message);
    return [];
  }
}

// ---- General images ----
function getGeneralImages() {
  const files = glob.sync('images/*.*', { cwd: publicFolder });

  return files.map(img => ({
    loc: `${domain}/${img.replace(/\\/g, '/')}`,
    lastmod: new Date().toISOString(),
    changefreq: 'monthly',
    images: []
  }));
}

// ---- Build XML safely ----
function buildXML(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

${urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    ${u.priority ? `<priority>${u.priority}</priority>` : ''}
    ${u.images && u.images.length > 0 ? u.images.map(img =>
      `<image:image><image:loc>${img}</image:loc></image:image>`
    ).join('') : ''}
  </url>
`).join('')}

</urlset>`;
}

// ---- MAIN ----
async function generateSitemap() {
  try {
    console.log("🧠 Generating clean SEO sitemap...");
    console.log("🚫 Excluding: admin folder, api folder, approvals.html, universal auth files");

    const staticPages = getStaticPages();
    const poemPages = await getPoemPages();
    const categoryPages = await getCategoryPages();
    const images = getGeneralImages();

    const all = [
      ...staticPages,
      ...poemPages,
      ...categoryPages,
      ...images
    ];

    // Remove duplicates based on loc
    const unique = [];
    const seen = new Set();
    for (const item of all) {
      if (!seen.has(item.loc)) {
        seen.add(item.loc);
        unique.push(item);
      }
    }

    console.log(`📄 Found ${unique.length} unique URLs`);
    console.log(`   - ${staticPages.length} static pages`);
    console.log(`   - ${poemPages.length} poem pages`);
    console.log(`   - ${categoryPages.length} category pages`);
    console.log(`   - ${images.length} images`);

    const xml = buildXML(unique);

    fs.writeFileSync(
      path.join(publicFolder, 'sitemap.xml'),
      xml,
      'utf8'
    );

    console.log('✅ Sitemap generated successfully!');
  } catch (err) {
    console.error('❌ Sitemap error:', err);
  }
}

generateSitemap();
