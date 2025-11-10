const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  try {
    const index = path.join(process.cwd(), 'dist', 'index.html');
    if (!require('fs').existsSync(index)) throw new Error('dist/index.html not found; run npm run build first');
    const url = 'file://' + index;
    console.log('Opening', url);
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
    const screenshotPath = 'scripts/screenshots/stats-file.png';
    const fs = require('fs');
    try { fs.mkdirSync('scripts/screenshots', { recursive: true }); } catch(e){}
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Saved screenshot to', screenshotPath);
    await browser.close();
  } catch (err) {
    console.error('Screenshot failed:', err);
    process.exit(1);
  }
})();
