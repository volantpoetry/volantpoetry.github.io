/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * Uses Firebase REST API - No npm install needed
 * Runs on GitHub Actions
 */

const fs = require('fs');
const path = require('path');

// ---- CONFIG ----
const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';
const MAX_POEMS = 5000;

// ✅ STATIC PAGES TO INDEX (18 pages)
const allowedPages = [
  // Root Pages
  'index.html',
  'poems.html',
  'poem.html',
  'submitpoems.html',
  'submission-guidelines.html',
  'all-categories.html',
  'poem-of-the-week.html',
  'quote-of-the-week.html',
  // Shared Pages
  'shared/about.html',
  'shared/contact.html',
  'shared/terms.html',
  'shared/privacy.html',
  // Store Pages
  'store/index.html',
  'store/submit.html',
  'store/faq.html',
  'store/refund.html',
  // Volant Foundry
  'volant_foundry/index.html'
];

// ---- FETCH POEMS USING REST API ----
async function fetchPoemsFromFirebase() {
  const collections = ['recentPoems', 'featuredPoems', 'classicPoems'];
  const allPoems = [];
  
  // Firebase REST API URL
  const baseUrl = 'https://silent-depth-default-rtdb.firebaseio.com';
  
  for (const collection of collections) {
    try {
      console.log(`   📂 Fetching from: ${collection}`);
      
      const url = `${baseUrl}/${collection}.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`   ⚠️ Failed to fetch ${collection}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data) {
        console.log(`   ⚠️ No data in ${collection}`);
        continue;
      }
      
      // Convert object to array with keys
      const items = Object.entries(data).map(([id, value]) => ({
        id: id,
        ...value
      }));
      
      console.log(`   📄 Found ${items.length} poems in ${collection}`);
      
      // Process each poem
      for (const poem of items) {
        const slug = poem.slug || 
                    (poem.title ? poem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : poem.id);
        
        // Get author name
        let author = poem.submittedBy || poem.author || poem.authorName || "Anonymous";
        const userId = poem.userId || poem.authorId;
        
        // Try to get username from users collection
        if (userId) {
          try {
            const userUrl = `${baseUrl}/users/${userId}.json`;
            const userResponse = await fetch(userUrl);
            if (userResponse.ok) {
              const userData = await userResponse.json();
              if (userData && userData.username) {
                author = userData.username;
              }
            }
          } catch (err) {
            // Silent fail - keep original author
          }
        }
        
        // Get timestamp
        let timestamp = poem.createdAt || poem.timestamp || poem.date || new Date().toISOString();
        
        allPoems.push({
          id: poem.id,
          title: poem.title || "Untitled",
          slug: slug,
          author: author,
          collection: collection,
          timestamp: timestamp
        });
      }
      
    } catch (err) {
      console.log(`   ⚠️ Error fetching ${collection}:`, err.message);
    }
  }
  
  console.log(`✅ Total poems fetched: ${allPoems.length}`);
  return allPoems;
}

// ---- Generate poem URLs ----
function generatePoemUrls(poems) {
  const results = [];
  let count = 0;
  
  for (const poem of poems) {
    if (count >= MAX_POEMS) break;
    
    const url = `${domain}/poem.html?collection=${encodeURIComponent(poem.collection)}&slug=${encodeURIComponent(poem.slug)}`;
    
    let lastmod = new Date().toISOString();
    if (poem.timestamp) {
      try {
        const date = new Date(poem.timestamp);
        if (!isNaN(date.getTime())) {
          lastmod = date.toISOString();
        }
      } catch (e) {}
    }
    
    results.push({
      loc: url,
      lastmod: lastmod,
      changefreq: 'weekly',
      priority: '0.8'
    });
    
    count++;
  }
  
  return results;
}

// ---- Get static URL ----
function getUrlWithHtml(filePath) {
  let cleanPath = filePath.replace(/^\.\//, '');
  if (cleanPath === 'index.html') return '';
  if (cleanPath.endsWith('/index.html')) return cleanPath.replace(/\/index\.html$/, '/');
  return cleanPath;
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
# ALLOW PUBLIC PAGES (18 pages to index)
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
# BLOCK SUBMISSION MANAGEMENT (NOT public submit pages)
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

// ---- MAIN ----
async function generateSitemap() {
  try {
    console.log("🧠 Generating SEO sitemap with .html extensions...");
    console.log(`📁 Domain: ${domain}`);
    console.log(`📄 Targeting ${allowedPages.length} static pages...`);
    console.log("🔄 All pages set to 'weekly' changefreq");
    console.log("🚫 Excluding Google verification files (google*.html)");
    
    // 1. Static Pages
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
    
    // 2. Dynamic Poems from Firebase REST API
    console.log("🔥 Fetching poems from Firebase REST API...");
    const poems = await fetchPoemsFromFirebase();
    const poemResults = generatePoemUrls(poems);
    console.log(`✅ ${poemResults.length} poem URLs generated`);
    
    // 3. Combine
    const allUrls = [...staticResults, ...poemResults];
    
    console.log(`\n📊 Total: ${allUrls.length} URLs`);
    console.log(`   Static: ${staticResults.length}`);
    console.log(`   Dynamic Poems: ${poemResults.length}`);
    
    // 4. Build sitemap
    const xml = buildXML(allUrls);
    fs.writeFileSync(path.join(publicFolder, 'sitemap.xml'), xml, 'utf8');
    console.log('✅ sitemap.xml generated');
    
    // 5. Sample URLs
    console.log('\n📋 Sample URLs:');
    allUrls.slice(0, 10).forEach(page => {
      console.log(`   - ${page.loc}`);
    });
    if (allUrls.length > 10) {
      console.log(`   ... and ${allUrls.length - 10} more`);
    }
    
    // 6. Generate robots.txt
    generateRobotsTxt();
    
    // 7. Summary
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
