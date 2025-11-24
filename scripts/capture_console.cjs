const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
  await new Promise((r) => setTimeout(r, 3000));
    // Navigate to Calibrate tab and attempt auto-calibrate to capture overlay behavior
    try {
      await page.evaluate(() => {
        const calTab = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim() === 'Calibrate');
        if (calTab) calTab.click();
      });
      await new Promise((r) => setTimeout(r, 800));
      // Ensure there's a capture button and click it to create a snapshot if available
      await page.evaluate(() => {
        const capture = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').toLowerCase().includes('capture frame') || (b.getAttribute('data-testid') === 'capture-frame'));
        if (capture) capture.click();
      });
      await new Promise((r) => setTimeout(r, 800));
      // Click auto-calibrate advanced if present
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="autocalibrate-advanced"]');
        if (btn && typeof (btn).click === 'function') (btn).click();
      });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: 'calibrator_autocal.png', fullPage: false });
    } catch (e) {
      console.log('Error when trying calibrate actions:', e.message);
    }
    try {
      // Click the 'Online Play' nav tab first to enter the online lobby
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim() === 'Online Play');
        if (tab) tab.click();
      });
      await new Promise((r) => setTimeout(r, 800));
      // Find a Join Now button and click it to simulate joining a match
      const clicked = await page.evaluate(() => {
        const joinBtn = Array.from(document.querySelectorAll('button')).find((b) => {
          const txt = (b.textContent || '').toLowerCase();
          return txt.includes('join now') || txt.includes('join now!') || txt === 'join';
        });
        if (joinBtn) {
          try { joinBtn.click(); } catch (err) { joinBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
          return true;
        }
        return false;
      });
      if (clicked) {
        console.log('Found and clicked demo element');
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        console.log('No demo element found (demo|dfemo)');
      }
    } catch (e) {
      console.log('Error when trying to click demo element:', e.message);
    }
  } catch (e) {
    console.error('Navigation or page load failed', e.message);
  }
  await browser.close();
})();