// Simple E2E UI smoke test using puppeteer
const puppeteer = require('puppeteer');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173/';

async function waitForTextElement(page, { selectors, texts, timeout = 10000, optional = false }) {
  const matcherList = (Array.isArray(texts) ? texts : [texts])
    .filter(Boolean)
    .map((text) => text.toLowerCase());
  try {
    const handle = await page.waitForFunction(
      (sels, targets) => {
        for (const selector of sels) {
          const nodes = Array.from(document.querySelectorAll(selector));
          for (const node of nodes) {
            const content = (node.textContent || '').toLowerCase();
            if (targets.some((text) => content.includes(text))) {
              return node;
            }
          }
        }
        return null;
      },
      { timeout },
      selectors,
      matcherList,
    );
    return handle.asElement();
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}

(async () => {
  console.log('E2E UI smoke test starting...');
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    console.log('Opening', TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
    // Wait for the Online Play header or nav link
    await page.waitForSelector('h2, h1', { timeout: 10000 }).catch(() => null);
    // Try to find a button or link that contains 'Online Play'
    const onlineElement = await waitForTextElement(page, {
      selectors: ['h2', 'a', 'button'],
      texts: 'online play',
      timeout: 10000,
      optional: true,
    });
    if (onlineElement) {
      console.log('Found Online Play heading; navigating to it');
      try { await onlineElement.click(); } catch {}
    }
    // Wait for Create Match button
    const createMatchButton = await waitForTextElement(page, {
      selectors: ['button'],
      texts: ['create match', 'create match +'],
      timeout: 10000,
      optional: true,
    });
    if (createMatchButton) {
      console.log('Create Match button found');
    } else {
      console.warn('Create Match button not detected (may require login); continuing');
    }

    // Toggle Focus Mode
    const focusButton = await waitForTextElement(page, {
      selectors: ['button'],
      texts: ['focus mode', 'exit focus'],
      timeout: 10000,
      optional: true,
    });
    if (focusButton) {
      console.log('Toggling Focus Mode');
      await focusButton.click();
      // Wait for overlay text
      const focusOverlay = await waitForTextElement(page, {
        selectors: ['button'],
        texts: ['focus mode', 'click to exit'],
        timeout: 10000,
      });
      console.log('Focus Mode overlay visible');
      // Click overlay button to exit
      try {
        await focusOverlay.click();
      } catch {}
      console.log('Exited Focus Mode');
    } else {
      console.warn('Focus Mode button not found; skipping');
    }

    console.log('E2E UI smoke test completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('E2E UI smoke test failed:', err?.message || err);
    process.exit(2);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
})();
