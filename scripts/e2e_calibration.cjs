const puppeteer = require('puppeteer');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173/';

(async () => {
  console.log('E2E calibration test starting...');
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
    console.log('[page] loaded', TARGET_URL);

    // Open Calibrator tab (sidebar)
    await page.waitForSelector('button[title="Calibrate"]', { timeout: 10000 }).catch(() => null);
    // Fallback: try link text
    const navBtn = await page.$x("//button[contains(., 'Calibrate')]");
    if (navBtn && navBtn.length) {
      await navBtn[0].click();
      console.log('[page] clicked Calibrate nav');
    } else {
      console.warn('[page] Calibrate nav not found - trying menu');
    }

    // Wait for the Calibrator canvas to mount and file input to be present
    await page.waitForSelector('input[type=file]', { timeout: 10000 });
    console.log('[page] found file input');

    // Create a test board image by drawing circles on an offscreen canvas then assign to file input
    await page.evaluate(async () => {
      const input = document.querySelector('input[type=file]');
      if (!input) return;
      const tmp = document.createElement('canvas');
      tmp.width = 1024;
      tmp.height = 768;
  const ctx = tmp.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, tmp.width, tmp.height);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(tmp.width/2, tmp.height/2, 170, 0, Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tmp.width/2, tmp.height/2, 99, 0, Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tmp.width/2, tmp.height/2, 15, 0, Math.PI*2);
      ctx.fillStyle = '#000';
      ctx.fill();
      // Convert to blob and create File
  const blob = await new Promise((resolve) => tmp.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'test-board.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
  // @ts-ignore
  input.files = dt.files;
      // Fire change event
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    console.log('[page] uploaded test board image');

    // Wait a moment for UI to render
    await page.waitForTimeout(500);

    // Click Legacy Auto Detect
    const legacyBtn = await page.$('[data-testid="autodetect-legacy"]');
    if (legacyBtn) {
      await legacyBtn.click();
      console.log('[page] clicked Legacy Auto Detect');
      // Wait for detection message or localStorage to update
      await page.waitForFunction(() => {
        const msg = document.querySelector('.text-yellow-300');
        if (msg && msg.textContent && msg.textContent.length > 0) return true;
        return !!localStorage.getItem('ndn-calibration-v1');
      }, { timeout: 10000 }).catch(() => null);
      console.log('[page] legacy detection completed');
    }

    // Click advanced Auto Calibrate
    const advBtn = await page.$('[data-testid="autocalibrate-advanced"]');
    if (advBtn) {
      await advBtn.click();
      console.log('[page] clicked Advanced Auto-Calibrate');
      // Wait for detection message or localStorage to update
      await page.waitForFunction(() => {
        const msg = document.querySelector('.text-yellow-300');
        if (msg && msg.textContent && msg.textContent.length > 0) return true;
        return !!localStorage.getItem('ndn-calibration-v1');
      }, { timeout: 15000 }).catch(() => null);
      console.log('[page] advanced auto-calibration completed');
    }

    // Verify localStorage contains a calibration with H
    const calib = await page.evaluate(() => localStorage.getItem('ndn-calibration-v1'));
    if (!calib) {
      console.error('[page] Calibration not found in localStorage');
    } else {
      console.log('[page] Calibration found');
      try {
        const parsed = JSON.parse(calib);
        if (parsed && parsed.H) console.log('[page] Homography saved');
      } catch (e) { console.warn('[page] failed to parse calibration'); }
    }

    console.log('E2E calibration test completed.');
  } catch (err) {
    console.error('E2E calibration test failed:', err);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
})();
