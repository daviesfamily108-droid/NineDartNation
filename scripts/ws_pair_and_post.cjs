const WebSocket = require('ws');

const WS_URL = process.env.TARGET_WS || 'ws://localhost:8787/ws';
const HTTP_BASE = process.env.TARGET_HTTP || 'http://localhost:8787';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('Connecting to', WS_URL);
  const ws = new WebSocket(WS_URL, { handshakeTimeout: 10000 });

  ws.on('open', () => {
    console.log('[ws] open - requesting cam-create');
    ws.send(JSON.stringify({ type: 'cam-create', persistent: false }));
  });

  ws.on('error', (err) => {
    console.error('[ws] error', err.message || err);
  });

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(String(msg));
      console.log('[ws] message:', data);
      if (data && data.type === 'cam-code') {
        const code = String(data.code || '').toUpperCase();
        console.log('Got cam code:', code);

        // Build calibration payload
        const payload = {
          H: [[1,0,0],[0,1,0],[0,0,1]],
          anchors: null,
          imageSize: { w: 800, h: 600 },
          errorPx: 0.42
        };

        try {
          const res = await fetch(`${HTTP_BASE}/cam/calibration/${code}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            // short timeout not built-in - rely on server
          });
          const j = await res.json().catch(() => null);
          console.log('[http] POST /cam/calibration ->', res.status, j);

          // Read back
          const res2 = await fetch(`${HTTP_BASE}/cam/calibration/${code}`);
          const j2 = await res2.json().catch(() => null);
          console.log('[http] GET /cam/calibration ->', res2.status, j2);
        } catch (err) {
          console.error('[http] Error posting/getting calibration:', err);
        } finally {
          // keep WS open for a short while then close
          await wait(500);
          try { ws.close(); } catch(e){}
        }
      }
    } catch (e) {
      console.error('[ws] non-json message', String(msg).slice(0,200));
    }
  });

  // safety timeout
  setTimeout(() => { try { ws.terminate(); } catch {} }, 15000);
})();
