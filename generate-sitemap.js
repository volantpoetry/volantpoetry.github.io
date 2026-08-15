/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * GENERATES URLs WITH .html EXTENSION + QUERY PARAMETERS
 * Includes dynamic poem URLs from Firebase
 * Runs on GitHub Actions
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

// ---- FIREBASE CONFIG ----
const firebaseConfig = {
  apiKey: "AIzaSyC4DHI8aBVY4JjTvJ-r-TGIDPsewtEWxzU",
  authDomain: "silent-depth.firebaseapp.com",
  projectId: "silent-depth",
  storageBucket: "silent-depth.appspot.com",
  messagingSenderId: "78008755450",
  appId: "1:78008755450:web:3fd0f0f298a08820935543"
};

// ---- CONFIG ----
const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';
const MAX_POEMS = 1000; // Max poems to include in sitemap

// ✅ STATIC PAGES TO INDEX (18 pages)
const allowedPages = [
  // Root Pages (9)
  'index.html',
  'poems.html',
  'poem.html',
  'submitpoems.html',
  'submission-guidelines.html',
  'all-categories.html',
  'poem-of-the-week.html',
  'quote-of-the-week.html',
  // Shared Pages (4)
  'shared/about.html',
  'shared/contact.html',
  'shared/terms.html',
  'shared/privacy.html',
  // Store Pages (4)
  'store/index.html',
  'store/submit.html',
  'store/faq.html',
  'store/refund.html',
  // Volant Foundry (1)
  'volant_foundry/index.html'
];

// 🚫 BLOCKED / NO-INDEX PAGES
const excludedPages = [
  'shared/verify-email.html',
  'shared/universal-login.html',
  'shared/universal-signup.html',
  'shared/users-reset.html',
  'shared/check-verification.html',
  'shared/existingVerify.html',
  'store/approvals.html',
  'store/dashboard.html',
  'store/details.html',
  'store/DETAIL',
  'volant_foundry/index2.html',
  'user-profile.html',
  '404.html',
  'verify.html',
  'verify-email.html',
  'users-signup.html',
  'users-reset.html',
  'users-login.html',
  'users-forgot.html',
  'user-edit-poems.html',
  'assign-images.html',
  'poemcount.html',
  'addcategories.html',
  'Select-Poem-of-the-Week.html',
  'list-files.py',
  'update-folder-resources.py'
];

// 🚫 EXCLUDED FOLDERS
const excludedFolders = [
  'admin',
  'api',
  'node_modules',
  '.git',
  '.vscode',
  '.continue',
  'backup',
  'backups_clean_urls',
  'images'
];

// ---- Exclusion helper ----
function isExcluded(file) {
  const fileParts = file.split(/[\/\\]/);
  
  for (const folder of excludedFolders) {
    if (fileParts.includes(folder)) return true;
  }
  
  for (const ex of excludedPages) {
    if (file === ex) return true;
  }
  
  // Exclude Google verification files
  const fileName = file.toLowerCase();
  if (fileName.match(/^google[0-9a-z_\-]+\.html$/i)) {
    return true;
  }
  
  for (const ex of excludedPages) {
    if (file.toLowerCase().includes(ex.toLowerCase())) return true;
  }
  
  return false;
}

// ---- Get static page URL ----
function getUrlWithHtml(filePath) {
  let cleanPath = filePath.replace(/^\.\//, '');
  if (cleanPath === 'index.html') return '';
  if (cleanPath.endsWith('/index.html')) return cleanPath.replace(/\/index\.html$/, '/');
  return cleanPath;
}

// ---- FETCH POEMS FROM FIRESTORE ----
async function fetchAllPoems() {
  console.log("🔥 Fetching poems from Firebase...");
  
  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    const allPoems = [];
    const collections = ['recentPoems', 'featuredPoems', 'classicPoems'];
    
    for (const collectionName of collections) {
      console.log(`   📂 Fetching from: ${collectionName}`);
      const colRef = collection(db, collectionName);
      const snapshot = await getDocs(colRef);
      
      if (snapshot.empty) {
        console.log(`   ⚠️ No poems in ${collectionName}`);
        continue;
      }
      
      console.log(`   📄 Found ${snapshot.docs.length} poems in ${collectionName}`);
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const slug = data.slug || 
                    (data.title ? data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : docSnap.id);
        
        // Get author name
        let author = data.submittedBy || data.author || data.authorName || "Anonymous";
        const userId = data.userId || data.authorId;
        if (userId) {
          try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
              author = userDoc.data().username || author;
            }
          } catch (err) {
            // Silent fail
          }
        }
        
        allPoems.push({
          id: docSnap.id,
          title: data.title || "Untitled",
          slug: slug,
          author: author,
          collection: collectionName,
          createdAt: data.createdAt || data.timestamp || new Date().toISOString()
        });
      }
    }
    
    console.log(`✅ Total poems fetched: ${allPoems.length}`);
    return allPoems;
    
  } catch (err) {
    console.error("❌ Error fetching poems:", err.message);
    console.log("⚠️ Continuing without dynamic poems...");
    return [];
  }
}

// ---- Generate poem URLs ----
function generatePoemUrls(poems) {
  const results = [];
  let count = 0;
  
  for (const poem of poems) {
    if (count >= MAX_POEMS) break;
    
    const url = `${domain}/poem.html?collection=${encodeURIComponent(poem.collection)}&slug=${encodeURIComponent(poem.slug)}`;
    
    // Parse date for lastmod
    let lastmod = new Date().toISOString();
    if (poem.createdAt) {
      try {
        const date = new Date(poem.createdAt);
        if (!isNaN(date.getTime())) {
          lastmod = date.toISOString();
        }
      } catch (e) {}
    }
    
    results.push({
      loc: url,
      lastmod: lastmod,
      changefreq: 'weekly',
      priority: '0.8',
      title: poem.title,
      author: poem.author,
      collection: poem.collection
    });
    
    count++;
  }
  
  return results;
}

// ---- Build XML ----
function buildXML(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

${urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>
`).join('')}

</urlset>`;
}

// ---- Generate robots.txt ----
function generateRobotsTxt() {
  const robots = `# Robots.txt for Volant Foundry
User-agent: *
Allow: /

# ============================================
# ALLOW PUBLIC PAGES
# ============================================

# Root Pages
Allow: /$
Allow: /index.html
Allow: /poems.html
Allow: /poem.html
Allow: /submitpoems.html
Allow: /submission-guidelines.html
Allow: /all-categories.html
Allow: /poem-of-the-week.html
Allow: /quote-of-the-week.html

# Shared Pages
Allow: /shared/about.html
Allow: /shared/contact.html
Allow: /shared/terms.html
Allow: /shared/privacy.html

# Store / Volant Reads
Allow: /store/index.html
Allow: /store/submit.html
Allow: /store/faq.html
Allow: /store/refund.html

# Volant Foundry
Allow: /volant_foundry/index.html

# ============================================
# BLOCK ADMIN PAGES
# ============================================
Disallow: /admin
Disallow: /admin-
Disallow: /admin.
Disallow: /administrators
Disallow: /dashboard
Disallow: /manage
Disallow: /testadmin
Disallow: /editor
Disallow: /addcategories
Disallow: /Select-
Disallow: /Manage-
Disallow: /assign-

# ============================================
# BLOCK LOGIN/SYSTEM PAGES
# ============================================
Disallow: /login
Disallow: /signup
Disallow: /register
Disallow: /verify
Disallow: /reset
Disallow: /forgot
Disallow: /notifications
Disallow: /messages

# ============================================
# BLOCK SUBMISSION MANAGEMENT
# ============================================
Disallow: /edit-
Disallow: /drafts
Disallow: /submit?*
Disallow: /submit/
Disallow: /submission?*
Disallow: /submission/

# ============================================
# BLOCK SPECIFIC SYSTEM FILES
# ============================================
Disallow: /verify.html
Disallow: /verify-email.html
Disallow: /users-signup.html
Disallow: /users-reset.html
Disallow: /users-login.html
Disallow: /users-forgot.html
Disallow: /user-edit-poems.html

# ============================================
# BLOCK STORE PROTECTED PAGES
# ============================================
Disallow: /store/approvals.html
Disallow: /store/dashboard.html
Disallow: /store/DETAIL
Disallow: /store/details.html

# ============================================
# BLOCK VOLANT FOUNDRY DUPLICATE
# ============================================
Disallow: /volant_foundry/index2.html

# ============================================
# BLOCK SHARED PROTECTED PAGES
# ============================================
Disallow: /shared/verify-email.html
Disallow: /shared/universal-login.html
Disallow: /shared/universal-signup.html
Disallow: /shared/users-reset.html
Disallow: /shared/check-verification.html
Disallow: /shared/existingVerify.html

# ============================================
# BLOCK USER-SPECIFIC PAGES
# ============================================
Disallow: /user-profile.html

# ============================================
# BLOCK GOOGLE VERIFICATION FILES
# ============================================
Disallow: /google*.html

# ============================================
# BLOCK NON-HTML FILES
# ============================================
Disallow: /*.js$
Disallow: /*.css$
Disallow: /*.css.map$
Disallow: /*.js.map$
Disallow: /*.json$
Disallow: /*.xml$

# ============================================
# BLOCK NODE_MODULES
# ============================================
Disallow: /node_modules/

# ============================================
# BLOCK IMAGES
# ============================================
Disallow: /images/

# ============================================
# BLOCK 404 PAGE
# ============================================
Disallow: /404.html

# ============================================
# SITEMAP LOCATION
# ============================================
Sitemap: ${domain}/sitemap.xml`;

  fs.writeFileSync(path.join(publicFolder, 'robots.txt'), robots, 'utf8');
  console.log('✅ robots.txt generated');
}

// ---- Generate sitemap index (if too many URLs) ----
function generateSitemapIndex(staticUrls, poemUrls) {
  const allUrls = [...staticUrls, ...poemUrls];
  const total = allUrls.length;
  
  // If fewer than 50,000 URLs, single sitemap is fine
  if (total < 50000) {
    return null;
  }
  
  // Split into chunks of 50,000
  const chunks = [];
  for (let i = 0; i < allUrls.length; i += 50000) {
    chunks.push(allUrls.slice(i, i + 50000));
  }
  
  // Generate sitemap index XML
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${chunks.map((_, i) => `
  <sitemap>
    <loc>${domain}/sitemap-${i + 1}.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
`).join('')}
</sitemapindex>`;
  
  return indexXml;
}

// ---- MAIN ----
async function generateSitemap() {
  try {
    console.log("🧠 Generating SEO sitemap with .html extensions...");
    console.log(`📁 Domain: ${domain}`);
    console.log(`📄 Targeting ${allowedPages.length} static pages...`);
    console.log("🔄 All pages set to 'weekly' changefreq");
    console.log("🚫 Excluding Google verification files (google*.html)");
    
    // ---- 1. Static Pages ----
    const staticResults = [];
    for (const page of allowedPages) {
      const fullPath = path.join(publicFolder, page);
      if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ Warning: ${page} not found, skipping...`);
        continue;
      }
      
      const stats = fs.statSync(fullPath);
      const urlPath = getUrlWithHtml(page);
      const url = urlPath === '' ? domain : `${domain}/${urlPath}`;
      
      let priority = '0.8';
      if (page === 'index.html' || urlPath === '' || urlPath === 'store/') {
        priority = '1.0';
      } else if (page === 'poems.html' || page === 'poem.html' || 
                 page === 'submitpoems.html' || page === 'submission-guidelines.html' ||
                 page === 'shared/about.html' || page === 'volant_foundry/index.html') {
        priority = '0.9';
      } else if (page.startsWith('store/')) {
        priority = '0.8';
      } else if (page.startsWith('shared/')) {
        priority = '0.6';
      } else {
        priority = '0.7';
      }
      
      staticResults.push({
        loc: url,
        lastmod: stats.mtime.toISOString(),
        changefreq: 'weekly',
        priority: priority
      });
    }
    
    console.log(`✅ ${staticResults.length} static pages generated`);
    
    // ---- 2. Dynamic Poem Pages ----
    const poems = await fetchAllPoems();
    const poemResults = generatePoemUrls(poems);
    console.log(`✅ ${poemResults.length} poem URLs generated`);
    
    // ---- 3. Combine and Build ----
    const allUrls = [...staticResults, ...poemResults];
    
    console.log(`\n📊 Sitemap Statistics:`);
    console.log(`   Static pages: ${staticResults.length}`);
    console.log(`   Dynamic poem pages: ${poemResults.length}`);
    console.log(`   Total URLs: ${allUrls.length}`);
    
    // Build sitemap
    const xml = buildXML(allUrls);
    fs.writeFileSync(path.join(publicFolder, 'sitemap.xml'), xml, 'utf8');
    console.log('✅ sitemap.xml generated');
    
    // ---- 4. Sample URLs ----
    console.log('\n📋 Sample URLs:');
    const samples = [
      ...staticResults.slice(0, 5),
      ...poemResults.slice(0, 5)
    ];
    samples.forEach(page => {
      console.log(`   - ${page.loc}`);
    });
    if (poemResults.length > 5) {
      console.log(`   ... and ${poemResults.length - 5} more poems`);
    }
    
    // ---- 5. Generate robots.txt ----
    generateRobotsTxt();
    
    // ---- 6. Summary ----
    console.log('\n📊 Sitemap Statistics:');
    console.log(`   Total URLs: ${allUrls.length}`);
    console.log(`   Static: ${staticResults.length}`);
    console.log(`   Dynamic Poems: ${poemResults.length}`);
    console.log(`   All pages: weekly`);
    console.log(`   Priority 1.0: ${allUrls.filter(u => u.priority === '1.0').length}`);
    console.log(`   Priority 0.9: ${allUrls.filter(u => u.priority === '0.9').length}`);
    console.log(`   Priority 0.8: ${allUrls.filter(u => u.priority === '0.8').length}`);
    console.log(`   Priority 0.7: ${allUrls.filter(u => u.priority === '0.7').length}`);
    console.log(`   Priority 0.6: ${allUrls.filter(u => u.priority === '0.6').length}`);

  } catch (err) {
    console.error('❌ Sitemap error:', err);
    process.exit(1);
  }
}

generateSitemap();
