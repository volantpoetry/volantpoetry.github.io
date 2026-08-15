/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * Uses Firebase REST API (the working version)
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
  'index.html',
  'poems.html',
  'poem.html',
  'submitpoems.html',
  'submission-guidelines.html',
  'all-categories.html',
  'poem-of-the-week.html',
  'quote-of-the-week.html',
  'shared/about.html',
  'shared/contact.html',
  'shared/terms.html',
  'shared/privacy.html',
  'store/index.html',
  'store/submit.html',
  'store/faq.html',
  'store/refund.html',
  'volant_foundry/index.html'
];

// ---- XML ESCAPE FUNCTION ----
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---- FETCH POEMS USING THE WORKING REST API APPROACH ----
async function fetchPoemsFromFirestore() {
  const collections = ['recentPoems', 'featuredPoems', 'classicPoems'];
  const allPoems = [];
  
  // Using the Realtime Database REST API (which works without auth)
  const baseUrl = 'https://silent-depth-default-rtdb.firebaseio.com';
  
  console.log('🔥 Connecting to Firebase Realtime Database...');
  console.log(`📡 Base URL: ${baseUrl}`);
  
  for (const collection of collections) {
    try {
      console.log(`\n   📂 Fetching from: ${collection}`);
      
      // Try Realtime Database first
      const url = `${baseUrl}/${collection}.json`;
      console.log(`   🔗 URL: ${url}`);
      
      const response = await fetch(url);
      console.log(`   📊 Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        console.log(`   ❌ Failed to fetch ${collection}: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data) {
        console.log(`   ⚠️ No data in ${collection}`);
        continue;
      }
      
      // Check if data is an object with keys
      if (typeof data !== 'object' || Array.isArray(data)) {
        console.log(`   ⚠️ Unexpected data format in ${collection}`);
        continue;
      }
      
      // Convert object to array with keys
      const keys = Object.keys(data);
      console.log(`   📄 Found ${keys.length} items in ${collection}`);
      
      for (const id of keys) {
        const poem = data[id];
        
        // Skip if poem is null or not an object
        if (!poem || typeof poem !== 'object') continue;
        
        // Generate slug from title or use id
        let slug = poem.slug;
        if (!slug && poem.title) {
          slug = poem.title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        }
        if (!slug) slug = id;
        
        // Get author name
        let author = poem.submittedBy || poem.author || poem.authorName || "Anonymous";
        
        // Get timestamp
        let timestamp = poem.createdAt || poem.timestamp || poem.date || poem.created || new Date().toISOString();
        
        allPoems.push({
          id: id,
          title: poem.title || "Untitled",
          slug: slug,
          author: author,
          collection: collection,
          timestamp: timestamp
        });
      }
      
    } catch (err) {
      console.log(`   ❌ Error fetching ${collection}:`, err.message);
    }
  }
  
  console.log(`\n✅ Total poems fetched: ${allPoems.length}`);
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

// ---- Build XML with proper escaping ----
function buildXML(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

${urls.map(u => `
  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
    <changefreq>${escapeXml(u.changefreq)}</changefreq>
    <priority>${escapeXml(u.priority)}</priority>
  </url>
`).join('')}

</urlset>`;
}

// ---- Generate robots.txt ----
function generateRobotsTxt() {
  const robots = `# Robots.txt for Volant Foundry
User-agent: *
Allow: /

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

# Block admin and private
Disallow: /admin
Disallow: /dashboard
Disallow: /manage
Disallow: /login
Disallow: /signup
Disallow: /verify
Disallow: /reset
Disallow: /store/approvals.html
Disallow: /store/dashboard.html
Disallow: /store/details.html
Disallow: /shared/verify-email.html
Disallow: /shared/universal-login.html
Disallow: /shared/universal-signup.html
Disallow: /shared/users-reset.html
Disallow: /user-profile.html

# Block Google verification
Disallow: /google*.html

# Block non-HTML files
Disallow: /*.js$
Disallow: /*.css$
Disallow: /*.json$
Disallow: /*.xml$

# Block node_modules
Disallow: /node_modules/

# Block images
Disallow: /images/

# Block 404
Disallow: /404.html

Sitemap: ${domain}/sitemap.xml`;

  fs.writeFileSync(path.join(publicFolder, 'robots.txt'), robots, 'utf8');
  console.log('✅ robots.txt generated');
}

// ---- MAIN ----
async function generateSitemap() {
  try {
    console.log("🧠 Generating SEO sitemap...");
    console.log(`📁 Domain: ${domain}`);
    console.log(`📄 Targeting ${allowedPages.length} static pages...`);
    
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
    
    // 2. Dynamic Poems from Realtime Database
    console.log("\n🔥 Fetching poems from Firebase Realtime Database...");
    const poems = await fetchPoemsFromFirestore();
    const poemResults = generatePoemUrls(poems);
    console.log(`✅ ${poemResults.length} poem URLs generated`);
    
    // 3. Combine
    const allUrls = [...staticResults, ...poemResults];
    
    console.log(`\n📊 Total: ${allUrls.length} URLs`);
    console.log(`   Static: ${staticResults.length}`);
    console.log(`   Dynamic Poems: ${poemResults.length}`);
    
    if (poemResults.length === 0) {
      console.log("\n⚠️ WARNING: No poem URLs generated!");
      console.log("📋 Trying alternative data structure...");
    }
    
    // 4. Build sitemap with proper XML escaping
    const xml = buildXML(allUrls);
    fs.writeFileSync(path.join(publicFolder, 'sitemap.xml'), xml, 'utf8');
    console.log('✅ sitemap.xml generated');
    
    // 5. Sample URLs
    console.log('\n📋 Sample URLs:');
    const sampleCount = Math.min(10, allUrls.length);
    for (let i = 0; i < sampleCount; i++) {
      console.log(`   - ${allUrls[i].loc}`);
    }
    if (allUrls.length > sampleCount) {
      console.log(`   ... and ${allUrls.length - sampleCount} more`);
    }
    
    // 6. Generate robots.txt
    generateRobotsTxt();
    
    // 7. Summary
    console.log('\n📊 Sitemap Statistics:');
    console.log(`   Total URLs: ${allUrls.length}`);
    console.log(`   Static: ${staticResults.length}`);
    console.log(`   Dynamic Poems: ${poemResults.length}`);
    console.log(`   All pages: weekly`);

  } catch (err) {
    console.error('❌ Sitemap error:', err);
    process.exit(1);
  }
}

generateSitemap();
