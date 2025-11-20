const WebSocket = require('ws');
const url = process.env.WS_URL || process.env.VITE_WS_URL || 'ws://localhost:8787';
console.log('Connecting to', url);
const ws = new WebSocket(url);
ws.on('open', () => {
  console.log('[ws_watch] connected to', url);
  try { ws.send(JSON.stringify({ type: 'watcher-hello', ts: Date.now() })) } catch {}
});
ws.on('message', (data) => {
  const s = (data || '').toString()
  try {
    const j = JSON.parse(s)
    console.log('[ws_watch] MSG:', JSON.stringify(j, null, 2))
  } catch (e) {
    console.log('[ws_watch] RAW:', s)
  }
});
ws.on('close', (code, reason) => console.log('[ws_watch] closed', code, reason && reason.toString()));
ws.on('error', (err) => console.error('[ws_watch] error', err));

// Keep process alive
setInterval(()=>{}, 60_000);
