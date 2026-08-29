/**
 * 🔥 Auto Sitemap Generator for Volant Ecosystem
 * Includes: Volant Poetry, Volant Reads, Volant Foundry, Volant Codes (external)
 * Uses Firebase Admin SDK with Service Account from GitHub Secrets
 * Runs on GitHub Actions
 */

const fs = require('fs');
const path = require('path');

// ---- CONFIG ----
const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';
const MAX_POEMS = 5000;

// ✅ STATIC PAGES TO INDEX
const allowedPages = [
  // Volant Poetry (Main)
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
  
  // Volant Reads (Store)
  'store/index.html',
  'store/submit.html',
  'store/faq.html',
  'store/refund.html',
  
  // Volant Foundry
  'volant_foundry/index.html'
];

// ============================================================
// 🚀 EXTERNAL PLATFORMS (Different Repos)
// ============================================================
const externalUrls = [
  // Volant Codes (Separate Repo)
  {
    loc: 'https://volantcodes.vercel.app/',
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.9'
  },
  {
    loc: 'https://volantcodes.vercel.app/index.html',
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.8'
  },
  {
    loc: 'https://volantcodes.vercel.app/#services',
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.7'
  },
  {
    loc: 'https://volantcodes.vercel.app/#portfolio',
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.7'
  },
  {
    loc: 'https://volantcodes.vercel.app/#pricing',
    lastmod: new Date().toISOString(),
    changefreq: 'monthly',
    priority: '0.6'
  },
  {
    loc: 'https://volantcodes.vercel.app/#testimonials',
    lastmod: new Date().toISOString(),
    changefreq: 'monthly',
    priority: '0.5'
  },
  {
    loc: 'https://volantcodes.vercel.app/#faq',
    lastmod: new Date().toISOString(),
    changefreq: 'monthly',
    priority: '0.5'
  },
  
  // Volant Lyrics (Future - coming soon)
  {
    loc: 'https://volantlyrics.vercel.app/',
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.8'
  },
  {
    loc: 'https://volantlyrics.vercel.app/index.html',
    lastmod: new Date().toISOString(),
    changefreq: 'weekly',
    priority: '0.7'
  },
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

// ---- FETCH POEMS FROM FIRESTORE USING ADMIN SDK ----
async function fetchPoemsFromFirestore() {
  console.log('🔍 Starting fetchPoemsFromFirestore...');
  
  try {
    console.log('📦 Loading firebase-admin with require...');
    const admin = require('firebase-admin');
    console.log('✅ firebase-admin loaded successfully');
    
    let serviceAccount;
    
    const secretKey = process.env.FIREBASE_KEY || 
                     process.env.FIREBASE_SERVICE_ACCOUNT || 
                     process.env.SERVICE_ACCOUNT_KEY;
    
    console.log(`🔐 Secret available: ${!!secretKey}`);
    console.log(`🔐 FIREBASE_KEY: ${!!process.env.FIREBASE_KEY}`);
    console.log(`🔐 SERVICE_ACCOUNT_KEY: ${!!process.env.SERVICE_ACCOUNT_KEY}`);
    
    if (secretKey) {
      console.log('🔐 Using service account from GitHub secret');
      try {
        serviceAccount = JSON.parse(secretKey);
        console.log('✅ Successfully parsed service account JSON');
        console.log(`   Project ID: ${serviceAccount.project_id || 'N/A'}`);
        console.log(`   Client Email: ${serviceAccount.client_email || 'N/A'}`);
      } catch (parseError) {
        console.log('⚠️ Failed to parse secret as JSON, trying base64 decode...');
        try {
          const decoded = Buffer.from(secretKey, 'base64').toString('utf8');
          serviceAccount = JSON.parse(decoded);
          console.log('✅ Successfully decoded and parsed base64 service account');
        } catch (base64Error) {
          console.log('❌ Failed to parse service account:', base64Error.message);
          return [];
        }
      }
    } else {
      console.log('📁 No secret found, trying local file...');
      const keyPath = path.join(process.cwd(), 'service-account-key.json');
      if (fs.existsSync(keyPath)) {
        console.log(`📁 Found local file: ${keyPath}`);
        serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        console.log('✅ Loaded service account from local file');
      } else {
        console.log(`❌ No service account key found at: ${keyPath}`);
        console.log('📋 Place service-account-key.json in project root for local testing');
        console.log('📋 Or set FIREBASE_KEY, FIREBASE_SERVICE_ACCOUNT, or SERVICE_ACCOUNT_KEY environment variable');
        return [];
      }
    }
    
    if (!admin.apps || admin.apps.length === 0) {
      console.log('🔧 Initializing Firebase Admin SDK...');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin SDK initialized successfully!');
    } else {
      console.log('✅ Firebase Admin SDK already initialized');
    }
    
    const db = admin.firestore();
    const collections = ['recentPoems', 'featuredPoems', 'classicPoems'];
    const allPoems = [];
    
    console.log('🔥 Connecting to Firestore...');
    
    for (const collection of collections) {
      try {
        console.log(`   📂 Fetching from: ${collection}`);
        
        const snapshot = await db.collection(collection).get();
        
        if (snapshot.empty) {
          console.log(`   ⚠️ No documents in ${collection}`);
          continue;
        }
        
        console.log(`   📄 Found ${snapshot.size} poems in ${collection}`);
        
        snapshot.forEach(doc => {
          const data = doc.data();
          const docId = doc.id;
          
          const title = data.title || 'Untitled';
          const slug = data.slug || 
                      title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 
                      docId;
          const author = data.author || data.submittedBy || data.authorName || 'Anonymous';
          
          let timestamp = new Date().toISOString();
          if (data.createdAt) {
            if (typeof data.createdAt === 'object' && data.createdAt.toDate) {
              timestamp = data.createdAt.toDate().toISOString();
            } else if (typeof data.createdAt === 'string') {
              timestamp = data.createdAt;
            } else if (typeof data.createdAt === 'number') {
              timestamp = new Date(data.createdAt).toISOString();
            }
          } else if (data.timestamp) {
            if (typeof data.timestamp === 'object' && data.timestamp.toDate) {
              timestamp = data.timestamp.toDate().toISOString();
            } else if (typeof data.timestamp === 'string') {
              timestamp = data.timestamp;
            }
          } else if (data.date) {
            if (typeof data.date === 'string') {
              timestamp = data.date;
            }
          }
          
          allPoems.push({
            id: docId,
            title: title,
            slug: slug,
            author: author,
            collection: collection,
            timestamp: timestamp
          });
        });
        
      } catch (err) {
        console.log(`   ❌ Error fetching ${collection}:`, err.message);
      }
    }
    
    console.log(`\n✅ Total poems fetched: ${allPoems.length}`);
    return allPoems;
    
  } catch (err) {
    console.error('❌ Failed to load Firebase Admin SDK:', err.message);
    console.error('Stack:', err.stack);
    console.log('📋 Make sure firebase-admin is installed: npm install firebase-admin');
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
  const robots = `# Robots.txt for Volant Foundry Ecosystem
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

# External Platforms (Volant Codes, Volant Lyrics)
# These are separate domains with their own robots.txt
# Sitemap includes them for better SEO

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

Sitemap: ${domain}/sitemap.xml

# External sitemaps (for reference)
# https://volantcodes.vercel.app/sitemap.xml
# https://volantlyrics.vercel.app/sitemap.xml`;

  fs.writeFileSync(path.join(publicFolder, 'robots.txt'), robots, 'utf8');
  console.log('✅ robots.txt generated');
}

// ---- MAIN ----
async function generateSitemap() {
  try {
    console.log("🧠 Generating SEO sitemap for Volant Ecosystem...");
    console.log(`📁 Domain: ${domain}`);
    console.log(`📄 Targeting ${allowedPages.length} static pages...`);
    console.log(`🚀 Including ${externalUrls.length} external platform URLs...`);
    
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
      
      // ============================================================
      // 🎯 OPTIMIZED PRIORITIES FOR GOOGLE SITELINKS
      // ============================================================
      let priority = '0.8';
      
      // PRIORITY 1.0 - Most Important (Homepage & Bookstore)
      if (page === 'index.html' || urlPath === '' || urlPath === 'store/') {
        priority = '1.0';
      } 
      // PRIORITY 0.9 - Core Pages (Should appear as sitelinks)
      else if (page === 'poems.html' || 
               page === 'submitpoems.html' || 
               page === 'shared/about.html' || 
               page === 'volant_foundry/index.html' ||
               page === 'poem-of-the-week.html' || 
               page === 'quote-of-the-week.html') {
        priority = '0.9';
      } 
      // PRIORITY 0.8 - Secondary Pages
      else if (page === 'submission-guidelines.html' || 
               page === 'all-categories.html' ||
               page === 'poem.html' ||
               page.startsWith('store/')) {
        priority = '0.8';
      } 
      // PRIORITY 0.6 - Legal/Contact Pages
      else if (page.startsWith('shared/')) {
        priority = '0.6';
      } 
      // Default
      else {
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
    console.log('\n📊 Static Page Priorities:');
    staticResults.forEach(r => {
      console.log(`   ${r.priority} → ${r.loc}`);
    });
    
    // 2. Dynamic Poems from Firestore
    console.log("\n🔥 Fetching poems from Firestore using Admin SDK...");
    const poems = await fetchPoemsFromFirestore();
    const poemResults = generatePoemUrls(poems);
    console.log(`✅ ${poemResults.length} poem URLs generated (priority 0.8)`);
    
    // 3. Combine all URLs
    const allUrls = [...staticResults, ...poemResults, ...externalUrls];
    
    console.log(`\n📊 Total: ${allUrls.length} URLs`);
    console.log(`   Static: ${staticResults.length}`);
    console.log(`   Dynamic Poems: ${poemResults.length}`);
    console.log(`   External Platforms: ${externalUrls.length}`);
    
    if (poemResults.length === 0) {
      console.log("\n⚠️ WARNING: No poem URLs generated!");
      console.log("📋 Check the logs above for errors.");
      console.log("📋 Possible issues:");
      console.log("   1. FIREBASE_KEY secret not set in GitHub Actions");
      console.log("   2. Firestore collections are empty or don't exist");
      console.log("   3. Firebase rules block read access");
      console.log("   4. Service account doesn't have permission to read Firestore");
    }
    
    // 4. Build sitemap with proper XML escaping
    const xml = buildXML(allUrls);
    fs.writeFileSync(path.join(publicFolder, 'sitemap.xml'), xml, 'utf8');
    console.log('✅ sitemap.xml generated');
    
    // 5. Sample URLs
    console.log('\n📋 Sample URLs:');
    const sampleCount = Math.min(10, allUrls.length);
    for (let i = 0; i < sampleCount; i++) {
      console.log(`   - ${allUrls[i].loc} (priority: ${allUrls[i].priority})`);
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
    console.log(`   External Platforms: ${externalUrls.length}`);
    console.log(`   All pages: weekly`);

  } catch (err) {
    console.error('❌ Sitemap error:', err);
    process.exit(1);
  }
}

generateSitemap();
