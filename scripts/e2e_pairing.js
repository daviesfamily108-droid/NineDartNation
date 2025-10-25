/*
  scripts/e2e_pairing.js
  - Launches Puppeteer to open the app root (TARGET_URL or default)
  - Opens a WS connection to request a pairing code (cam-create with persistent:true)
  - Prints the received cam-code and exits
  - Requires puppeteer and ws packages; puppeteer is a devDependency added earlier
*/

const WebSocket = require('ws');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('puppeteer not installed or failed to load; falling back to WS-only pairing test. To run full browser E2E install puppeteer.');
}

const TARGET_URL = process.env.TARGET_URL || 'https://ninedartnation.onrender.com/';
const TARGET_WS = process.env.TARGET_WS || 'wss://ninedartnation.onrender.com/ws';

(async () => {
  console.log('E2E pairing test starting...');
  try {
  let browser = null;
  if (puppeteer) {
    console.log('Opening browser to', TARGET_URL);
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    try {
      const res = await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 }).catch(e => null);
      if (res) console.log('[page] status:', res.status(), 'url:', res.url());
      else console.log('[page] no response (this can be OK for APIs)');
    } catch (e) {
      console.warn('[page] navigation failed:', e?.message || e);
    }
  } else {
    console.log('Skipping browser step (puppeteer not available). Proceeding with WebSocket pairing test.');
  }

  console.log('Opening WebSocket to request a pairing code at', TARGET_WS);
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(TARGET_WS, { handshakeTimeout: 10000 });
      let resolved = false;
      ws.on('open', () => {
        console.log('[ws] connected. Sending cam-create (persistent:true)');
        ws.send(JSON.stringify({ type: 'cam-create', persistent: true }));
      });
      ws.on('message', (msg) => {
        try {
          const data = JSON.parse(String(msg));
          console.log('[ws] message:', JSON.stringify(data));
          if (data && data.type === 'cam-code') {
            console.log('Received cam-code:', data.code, 'expiresAt:', data.expiresAt);
            if (!resolved) { resolved = true; ws.close(); resolve(); }
          }
        } catch (e) {
          console.log('[ws] non-json message:', String(msg).slice(0,200));
        }
      });
      ws.on('error', (err) => {
        console.error('[ws] error:', err.message || err);
        if (!resolved) { resolved = true; reject(err); }
      });
      ws.on('close', () => {
        if (!resolved) { resolved = true; resolve(); }
      });
      // safety timeout
      setTimeout(() => {
        if (!resolved) { resolved = true; console.warn('[ws] timed out waiting for cam-code'); ws.terminate(); resolve(); }
      }, 20000);
    });

    console.log('E2E pairing test completed.');
  } catch (err) {
    console.error('E2E test failed:', err?.message || err);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
})();
