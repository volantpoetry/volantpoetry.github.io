/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * Uses Firebase Firestore REST API
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

// ---- FETCH POEMS FROM FIRESTORE USING REST API ----
async function fetchPoemsFromFirestore() {
  const collections = ['recentPoems', 'featuredPoems', 'classicPoems'];
  const allPoems = [];
  
  // Firestore REST API URL
  const baseUrl = 'https://firestore.googleapis.com/v1/projects/silent-depth/databases/(default)/documents';
  
  console.log('🔥 Connecting to Firestore...');
  
  for (const collection of collections) {
    try {
      console.log(`   📂 Fetching from: ${collection}`);
      
      const url = `${baseUrl}/${collection}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`   ❌ Failed to fetch ${collection}: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data || !data.documents || data.documents.length === 0) {
        console.log(`   ⚠️ No documents in ${collection}`);
        continue;
      }
      
      console.log(`   📄 Found ${data.documents.length} poems in ${collection}`);
      
      // Process each document
      for (const doc of data.documents) {
        const docId = doc.name.split('/').pop();
        const fields = doc.fields || {};
        
        // Get title - handle different field types
        let title = 'Untitled';
        if (fields.title) {
          if (fields.title.stringValue) title = fields.title.stringValue;
          else if (fields.title.integerValue) title = String(fields.title.integerValue);
          else if (fields.title.doubleValue) title = String(fields.title.doubleValue);
        }
        
        // Get slug
        let slug = fields.slug?.stringValue || null;
        if (!slug) {
          slug = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        }
        if (!slug || slug === '') slug = docId;
        
        // Get author
        let author = 'Anonymous';
        if (fields.author?.stringValue) author = fields.author.stringValue;
        else if (fields.submittedBy?.stringValue) author = fields.submittedBy.stringValue;
        else if (fields.authorName?.stringValue) author = fields.authorName.stringValue;
        
        // Get timestamp
        let timestamp = new Date().toISOString();
        if (fields.createdAt?.timestampValue) timestamp = fields.createdAt.timestampValue;
        else if (fields.createdAt?.stringValue) timestamp = fields.createdAt.stringValue;
        else if (fields.timestamp?.stringValue) timestamp = fields.timestamp.stringValue;
        else if (fields.timestamp?.timestampValue) timestamp = fields.timestamp.timestampValue;
        else if (fields.date?.stringValue) timestamp = fields.date.stringValue;
        
        allPoems.push({
          id: docId,
          title: title,
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
    
    // 2. Dynamic Poems from Firestore
    console.log("\n🔥 Fetching poems from Firestore...");
    const poems = await fetchPoemsFromFirestore();
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
