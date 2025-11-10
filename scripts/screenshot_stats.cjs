const puppeteer = require('puppeteer');
const http = require('http');

async function waitForServer(url, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(url, (r) => { r.resume(); res(); });
        req.on('error', rej);
      });
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Timed out waiting for server');
}

(async () => {
  try {
    const url = process.env.URL || 'http://localhost:5173/'
    console.log('Waiting for dev server at', url)
    await waitForServer(url)
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait for the Match Stats heading to be present
    await page.waitForSelector('h2:contains("Match Stats"), h2', { timeout: 5000 }).catch(()=>{});
    const screenshotPath = 'scripts/screenshots/stats.png';
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
