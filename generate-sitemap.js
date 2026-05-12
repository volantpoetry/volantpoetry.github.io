* 🔥 Auto Sitemap Generator for Rence Blunt Poetry (SEO CLEAN VERSION)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ---- CONFIG ----
const domain = 'https://volantpoetry.github.io';
const publicFolder = './';
const firebaseKeyPath = './serviceAccountKey.json';

// 🚫 BLOCKED / NO-INDEX PAGES
const excludedPages = [
  'admin', 'dashboard', 'manage', 'editor',
  'login', 'signup', 'reset', 'verify',
  'comment', 'draft', 'test', 'user',
  'assign-images.html',
  'poemcount.html',
  'poem.html',
  'addcategories.html',
  'Select-Poem-of-the-Week.html'
];

// ---- Firebase ----
const serviceAccount = require(firebaseKeyPath);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ---- Exclusion helper ----
function isExcluded(file) {
  return excludedPages.some(ex =>
    file.toLowerCase().includes(ex.toLowerCase())
  );
}

// ---- Safe image path builder (FIXED DUPLICATION BUG) ----
function getImagesForFolder(folder) {
  const folderPath = path.join(publicFolder, folder);

  if (!fs.existsSync(folderPath)) return [];

  const files = glob.sync('**/*.*', { cwd: folderPath });

  return files.map(f =>
    `${domain}/${folder}/${f.replace(/\\/g, '/')}`
      .replace(/\/+/g, '/')
      .replace(':/', '://')
  );
}

// ---- Static pages ----
function getStaticPages() {
  const files = glob.sync('*.html', { cwd: publicFolder });

  return files
    .filter(file => !isExcluded(file))
    .map(file => {
      const filePath = path.join(publicFolder, file);
      const stats = fs.statSync(filePath);

      const lastmod = stats.mtime.toISOString();

      const imageFolder =
        file === 'index.html'
          ? 'images/index'
          : `images/${file.replace('.html', '')}`;

      return {
        loc: `${domain}/${file === 'index.html' ? '' : file}`,
        lastmod,
        changefreq: 'monthly',
        images: getImagesForFolder(imageFolder)
      };
    });
}

// ---- Poems (priority SEO content) ----
// ---- Poems (priority SEO content) - FIXED to use title-based slugs ----
async function getPoemPages() {
  const snapshot = await db.collection('recentPoems').get();

  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    
    // CRITICAL: Generate the same slug your poem.html expects
    // If your poems have a 'slug' field already, use that
    let slug = data.slug;
    
    // If no slug field exists, create one from the title
    if (!slug && data.title) {
      slug = data.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')      // Remove punctuation
        .replace(/\s+/g, '-')         // Replace spaces with hyphens
        .replace(/-+/g, '-')          // Remove multiple hyphens
        .trim();
    }
    
    // Fallback to ID only if absolutely necessary (should not happen)
    if (!slug) slug = docSnap.id;

    const lastmod = data.timestamp
      ? data.timestamp.toDate().toISOString()
      : new Date().toISOString();

    // Determine collection (adjust based on your data structure)
    const collection = data.collection || 'recentPoems';

    return {
      // ✅ CORRECT: Use title-based slug, not Firestore ID
      loc: `${domain}/poem.html?collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.9',
      images: getImagesForFolder(`images/poems/${docSnap.id}`)
    };
  });
}

// ---- Categories (clean URLs only) ----
async function getCategoryPages() {
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
}

// ---- Root images (FIXED PATH BUG) ----
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
    ${u.images.map(img =>
      `<image:image><image:loc>${img}</image:loc></image:image>`
    ).join('')}
  </url>
`).join('')}

</urlset>`;
}

// ---- MAIN ----
async function generateSitemap() {
  try {
    console.log("🧠 Generating clean SEO sitemap...");

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

    const xml = buildXML(all);

    fs.writeFileSync(
      path.join(publicFolder, 'sitemap.xml'),
      xml,
      'utf8'
    );

    console.log('✅ Sitemap generated (SEO CLEAN + FIXED)');
  } catch (err) {
    console.error('❌ Sitemap error:', err);
  }
}

generateSitemap();
