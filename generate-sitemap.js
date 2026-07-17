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
  'Select-Poem-of-the-Week.html'
];

// 🚫 EXCLUDED FOLDERS (entire folders)
const excludedFolders = [
  'admin',     // ❌ Entire admin folder
  'api'        // ❌ Entire api folder (serverless functions)
];

// ---- Firebase ----
const serviceAccount = require(firebaseKeyPath);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ---- Exclusion helper ----
function isExcluded(file) {
  // Check if file is in excluded folders
  const fileParts = file.split('/');
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

// ---- Helper to check if a folder should be scanned ----
function shouldScanFolder(folderPath) {
  // Skip excluded folders
  for (const excluded of excludedFolders) {
    if (folderPath.includes(excluded) || folderPath === excluded) {
      return false;
    }
  }
  return true;
}

// ---- Safe image path builder ----
function getImagesForFolder(folder) {
  const folderPath = path.join(publicFolder, folder);

  if (!fs.existsSync(folderPath)) return [];
  
  // Skip if folder is excluded
  if (!shouldScanFolder(folder)) return [];

  const files = glob.sync('**/*.*', { cwd: folderPath });

  return files.map(f =>
    `${domain}/${folder}/${f.replace(/\\/g, '/')}`
      .replace(/\/+/g, '/')
      .replace(':/', '://')
  );
}

// ---- Static pages (scans root, store, shared, etc.) ----
function getStaticPages() {
  // Scan root for HTML files
  const rootFiles = glob.sync('*.html', { cwd: publicFolder });
  
  // Scan subfolders for HTML files (but skip excluded folders)
  const subFolderFiles = [];
  const folders = ['store', 'shared', 'volant_foundry'];
  
  for (const folder of folders) {
    if (!shouldScanFolder(folder)) continue;
    const files = glob.sync(`${folder}/*.html`, { cwd: publicFolder });
    subFolderFiles.push(...files);
  }

  const allFiles = [...rootFiles, ...subFolderFiles];

  return allFiles
    .filter(file => !isExcluded(file))
    .map(file => {
      const filePath = path.join(publicFolder, file);
      const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

      const lastmod = stats ? stats.mtime.toISOString() : new Date().toISOString();
      
      // Determine image folder
      const fileName = path.basename(file, '.html');
      const fileDir = path.dirname(file);
      const imageFolder = fileDir === '.' ? `images/${fileName}` : `images/${fileDir}/${fileName}`;

      return {
        loc: `${domain}/${file}`,
        lastmod,
        changefreq: 'monthly',
        images: getImagesForFolder(imageFolder)
      };
    });
}

// ---- Poems (priority SEO content) ----
async function getPoemPages() {
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

// ---- Categories ----
async function getCategoryPages() {
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

// ---- Root images ----
function getGeneralImages() {
  // Only include images from allowed folders
  const allowedImageFolders = ['images', 'store/images', 'shared/images', 'volant_foundry/images'];
  let allImages = [];
  
  for (const folder of allowedImageFolders) {
    if (!shouldScanFolder(folder)) continue;
    const folderPath = path.join(publicFolder, folder);
    if (fs.existsSync(folderPath)) {
      const files = glob.sync('**/*.{png,jpg,jpeg,gif,svg,webp}', { cwd: folderPath });
      allImages.push(...files.map(f => `${folder}/${f}`));
    }
  }

  return allImages.map(img => ({
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
    console.log(`📁 Saved to: ${path.join(publicFolder, 'sitemap.xml')}`);
  } catch (err) {
    console.error('❌ Sitemap error:', err);
  }
}

generateSitemap();
