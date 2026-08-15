/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * GENERATES URLs WITH .html EXTENSION
 * All pages set to weekly changefreq
 * EXCLUDES Google verification files
 * Runs on GitHub Actions
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// ---- CONFIG ----
const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';

// ✅ PAGES TO INDEX (18 pages)
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

// 🚫 BLOCKED / NO-INDEX PAGES (exact matches)
const excludedPages = [
  // Shared protected
  'shared/verify-email.html',
  'shared/universal-login.html',
  'shared/universal-signup.html',
  'shared/users-reset.html',
  'shared/check-verification.html',
  'shared/existingVerify.html',
  // Store protected
  'store/approvals.html',
  'store/dashboard.html',
  'store/details.html',
  'store/DETAIL',
  // Volant Foundry duplicate
  'volant_foundry/index2.html',
  // User pages
  'user-profile.html',
  // System
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

// 🚫 GOOGLE VERIFICATION FILES - automatically excluded
// Pattern: google*.html (e.g., google1234567890.html)
// Pattern: Google*.html
// These are temporary verification files that should NOT be indexed

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
  
  // Check excluded folders
  for (const folder of excludedFolders) {
    if (fileParts.includes(folder)) {
      return true;
    }
  }
  
  // Check exact excluded pages
  for (const ex of excludedPages) {
    if (file === ex) {
      return true;
    }
  }
  
  // 🔥 EXCLUDE GOOGLE VERIFICATION FILES
  // Pattern: google*.html (case insensitive)
  const fileName = file.toLowerCase();
  if (fileName.match(/^google[0-9a-z_\-]+\.html$/i)) {
    console.log(`🚫 Excluding Google verification: ${file}`);
    return true;
  }
  
  // Also exclude any file starting with "google" in the root
  if (fileName.startsWith('google') && fileName.endsWith('.html')) {
    console.log(`🚫 Excluding Google file: ${file}`);
    return true;
  }
  
  // Check if file contains any excluded pattern
  for (const ex of excludedPages) {
    if (file.toLowerCase().includes(ex.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

// ---- Get URL with .html extension ----
function getUrlWithHtml(filePath) {
  let cleanPath = filePath;
  
  // Remove leading ./
  cleanPath = cleanPath.replace(/^\.\//, '');
  
  // For index.html, return folder path
  if (cleanPath === 'index.html') {
    return '';
  }
  
  // For subfolder index.html
  if (cleanPath.endsWith('/index.html')) {
    return cleanPath.replace(/\/index\.html$/, '/');
  }
  
  // Keep the .html extension for all other files
  return cleanPath;
}

// ---- Scan folders for allowed pages ----
function getAllowedPages() {
  const results = [];
  
  for (const page of allowedPages) {
    const fullPath = path.join(publicFolder, page);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ Warning: ${page} not found, skipping...`);
      continue;
    }
    
    const stats = fs.statSync(fullPath);
    const lastmod = stats.mtime.toISOString();
    const urlPath = getUrlWithHtml(page);
    
    // Build URL
    let url;
    if (urlPath === '') {
      url = domain;  // Root domain for index.html
    } else {
      url = `${domain}/${urlPath}`;
    }

    // All pages set to weekly
    let priority = '0.8';
    let changefreq = 'weekly';
    
    // Homepage - highest priority
    if (page === 'index.html' || urlPath === '' || urlPath === 'store/') {
      priority = '1.0';
    } 
    // Important content pages
    else if (page === 'poems.html' || 
             page === 'poem.html' ||
             page === 'submitpoems.html' ||
             page === 'submission-guidelines.html' ||
             page === 'shared/about.html' ||
             page === 'volant_foundry/index.html') {
      priority = '0.9';
    } 
    // Store pages
    else if (page.startsWith('store/')) {
      priority = '0.8';
    } 
    // Shared pages (contact, terms, privacy)
    else if (page.startsWith('shared/')) {
      priority = '0.6';
    } 
    // Other root pages
    else {
      priority = '0.7';
    }

    results.push({
      loc: url,
      lastmod,
      changefreq,
      priority,
      file: page
    });
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
function generateSitemap() {
  try {
    console.log("🧠 Generating SEO sitemap with .html extensions...");
    console.log(`📁 Domain: ${domain}`);
    console.log(`📄 Targeting ${allowedPages.length} allowed pages...`);
    console.log("🔄 All pages set to 'weekly' changefreq");
    console.log("🚫 Excluding Google verification files (google*.html)");
    
    const staticPages = getAllowedPages();

    console.log(`📄 Found ${staticPages.length} unique URLs`);

    const xml = buildXML(staticPages);
    fs.writeFileSync(path.join(publicFolder, 'sitemap.xml'), xml, 'utf8');

    console.log('✅ Sitemap generated successfully with .html extensions!');
    console.log('\n📋 Sample URLs:');
    staticPages.slice(0, 10).forEach(page => {
      console.log(`   - ${page.loc} (${page.changefreq})`);
    });
    if (staticPages.length > 10) {
      console.log(`   ... and ${staticPages.length - 10} more`);
    }

    // Generate robots.txt
    generateRobotsTxt();

    console.log('\n📊 Sitemap Statistics:');
    console.log(`   Total URLs: ${staticPages.length}`);
    console.log(`   All pages: weekly`);
    console.log(`   Priority 1.0: ${staticPages.filter(u => u.priority === '1.0').length}`);
    console.log(`   Priority 0.9: ${staticPages.filter(u => u.priority === '0.9').length}`);
    console.log(`   Priority 0.8: ${staticPages.filter(u => u.priority === '0.8').length}`);
    console.log(`   Priority 0.7: ${staticPages.filter(u => u.priority === '0.7').length}`);
    console.log(`   Priority 0.6: ${staticPages.filter(u => u.priority === '0.6').length}`);

  } catch (err) {
    console.error('❌ Sitemap error:', err);
    process.exit(1);
  }
}

generateSitemap();
