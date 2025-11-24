const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    console.log('BROWSER_CONSOLE [', msg.type(), ']', msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('PAGE_ERROR', err.message);
    console.log(err.stack);
  });
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 20000 });
    // Wait a few seconds to capture any async errors
    await page.waitForTimeout(3000);
  } catch (e) {
    console.error('Navigation or page load failed', e.message);
  }
  await browser.close();
})();