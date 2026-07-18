/**
 * 🔥 Auto Sitemap Generator for Volant Foundry
 * GENERATES CLEAN URLs (no .html extension)
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

// ---- Get clean URL (no .html) ----
function getCleanUrl(filePath) {
  let cleanPath = filePath.replace(/\.html$/, '');
  if (cleanPath.endsWith('/index')) {
    cleanPath = cleanPath.replace(/\/index$/, '');
  }
  if (cleanPath === 'index') {
    cleanPath = '';
  }
  cleanPath = cleanPath.replace(/^\.\//, '');
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

// ---- Static pages (clean URLs) ----
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
      const cleanFile = getCleanUrl(file);
      
      let url;
      if (cleanFile === '') {
        url = domain;
      } else {
        url = `${domain}/${cleanFile}`;
      }

      let priority = '0.8';
      let changefreq = 'monthly';
      
      if (cleanFile === '' || cleanFile === 'store' || cleanFile === 'store/index') {
        priority = '1.0';
        changefreq = 'daily';
      } else if (cleanFile === 'poems' || cleanFile.includes('store/details')) {
        priority = '0.9';
        changefreq = 'weekly';
      } else if (cleanFile.startsWith('shared/')) {
        priority = '0.6';
        changefreq = 'monthly';
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

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

// ---- MAIN ----
function generateSitemap() {
  try {
    console.log("🧠 Generating clean SEO sitemap...");
    console.log(`📁 Domain: ${domain}`);
    console.log("🚫 Excluded: admin, api, approvals, universal auth files");

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

    console.log('✅ Sitemap generated successfully with clean URLs!');
    console.log('\n📋 Sample URLs:');
    console.log(`   - ${domain}/`);
    console.log(`   - ${domain}/store`);
    console.log(`   - ${domain}/shared/about`);
    console.log(`   - ${domain}/shared/contact`);

  } catch (err) {
    console.error('❌ Sitemap error:', err);
    process.exit(1);
  }
}

generateSitemap();
