/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * GENERATES URLs WITH .html EXTENSION (no clean URLs)
 * Runs on GitHub Actions
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// ---- CONFIG ----
const domain = 'https://volantpoetry.vercel.app';
const publicFolder = './';

// 🚫 BLOCKED / NO-INDEX PAGES
const excludedPages = [
  'admin', 'dashboard', 'manage', 'editor',
  'login', 'signup', 'reset', 'verify',
  'comment', 'draft', 'test', 'user',
  'approvals', 'universal-login', 'universal-signup',
  'assign-images.html', 'poemcount.html', 'poem.html',
  'addcategories.html', 'Select-Poem-of-the-Week.html',
  'existingVerify.html', 'check-verification.html',
  'list-files.py', 'update-folder-resources.py'
];

// 🚫 EXCLUDED FOLDERS
const excludedFolders = [
  'admin', 'api', 'node_modules', '.git', '.vscode',
  '.continue', 'backup', 'backups_clean_urls'
];

// ---- Exclusion helper ----
function isExcluded(file) {
  const fileParts = file.split(/[\/\\]/);
  for (const folder of excludedFolders) {
    if (fileParts.includes(folder)) {
      return true;
    }
  }
  return excludedPages.some(ex =>
    file.toLowerCase().includes(ex.toLowerCase())
  );
}

// ---- Get URL with .html extension ----
function getUrlWithHtml(filePath) {
  let cleanPath = filePath;
  
  // Remove leading ./ if present
  cleanPath = cleanPath.replace(/^\.\//, '');
  
  // For index.html, just return the folder path or empty for root
  if (cleanPath === 'index.html') {
    return '';
  }
  
  // For subfolder index.html (e.g., store/index.html -> store/)
  if (cleanPath.endsWith('/index.html')) {
    return cleanPath.replace(/\/index\.html$/, '/');
  }
  
  // Keep the .html extension for all other files
  return cleanPath;
}

// ---- Scan folders ----
function scanFolderForHTML(folder) {
  for (const excluded of excludedFolders) {
    if (folder.includes(excluded) || folder === excluded) {
      return [];
    }
  }
  const pattern = `${folder}/*.html`;
  return glob.sync(pattern, { cwd: publicFolder });
}

// ---- Static pages (with .html URLs) ----
function getStaticPages() {
  const rootFiles = glob.sync('*.html', { cwd: publicFolder });
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
      const urlPath = getUrlWithHtml(file);
      
      // Build URL with .html extension
      let url;
      if (urlPath === '') {
        url = domain;  // Root domain for index.html
      } else {
        url = `${domain}/${urlPath}`;
      }

      // Priority and changefreq based on page importance
      let priority = '0.8';
      let changefreq = 'monthly';
      
      // Homepage - highest priority
      if (file === 'index.html' || urlPath === '' || urlPath === 'store/' || urlPath === 'store/index.html') {
        priority = '1.0';
        changefreq = 'daily';
      } 
      // Important content pages
      else if (file === 'poems.html' || 
               file === 'submission-guidelines.html' ||
               file === 'submitpoems.html' ||
               file.includes('store/details.html')) {
        priority = '0.9';
        changefreq = 'weekly';
      } 
      // Shared pages (about, contact, privacy, terms)
      else if (file.startsWith('shared/')) {
        priority = '0.6';
        changefreq = 'monthly';
      } 
      // Store pages
      else if (file.startsWith('store/')) {
        priority = '0.7';
        changefreq = 'weekly';
      } 
      // Volant Foundry pages
      else if (file.startsWith('volant_foundry/')) {
        priority = '0.8';
        changefreq = 'weekly';
      }

      return {
        loc: url,
        lastmod,
        changefreq,
        priority,
        images: []
      };
    });
}

// ---- Build XML ----
function buildXML(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

${urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    ${u.priority ? `<priority>${u.priority}</priority>` : ''}
  </url>
`).join('')}

</urlset>`;
}

// ---- Generate robots.txt ----
function generateRobotsTxt() {
  const robots = `# Robots.txt for Volant Foundry
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

  fs.writeFileSync(path.join(publicFolder, 'robots.txt'), robots, 'utf8');
  console.log('✅ robots.txt generated');
}

// ---- MAIN ----
function generateSitemap() {
  try {
    console.log("🧠 Generating SEO sitemap with .html extensions...");
    console.log(`📁 Domain: ${domain}`);
    console.log("🚫 Excluded: admin, api, approvals, universal auth files");
    console.log("🔗 Using URLs with .html extension");

    const staticPages = getStaticPages();

    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const item of staticPages) {
      if (!seen.has(item.loc)) {
        seen.add(item.loc);
        unique.push(item);
      }
    }

    console.log(`📄 Found ${unique.length} unique URLs`);

    const xml = buildXML(unique);
    fs.writeFileSync(path.join(publicFolder, 'sitemap.xml'), xml, 'utf8');

    console.log('✅ Sitemap generated successfully with .html extensions!');
    console.log('\n📋 Sample URLs:');
    console.log(`   - ${domain}/`);
    console.log(`   - ${domain}/store/index.html`);
    console.log(`   - ${domain}/shared/about.html`);
    console.log(`   - ${domain}/shared/contact.html`);
    console.log(`   - ${domain}/volant_foundry/index.html`);
    console.log(`   - ${domain}/submission-guidelines.html`);
    console.log(`   - ${domain}/submitpoems.html`);

    // Generate robots.txt
    generateRobotsTxt();

    console.log('\n📊 Sitemap Statistics:');
    console.log(`   Total URLs: ${unique.length}`);
    console.log(`   Priority 1.0: ${unique.filter(u => u.priority === '1.0').length}`);
    console.log(`   Priority 0.9: ${unique.filter(u => u.priority === '0.9').length}`);
    console.log(`   Priority 0.8: ${unique.filter(u => u.priority === '0.8').length}`);
    console.log(`   Priority 0.7: ${unique.filter(u => u.priority === '0.7').length}`);
    console.log(`   Priority 0.6: ${unique.filter(u => u.priority === '0.6').length}`);

  } catch (err) {
    console.error('❌ Sitemap error:', err);
    process.exit(1);
  }
}

generateSitemap();
