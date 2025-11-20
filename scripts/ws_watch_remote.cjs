const WebSocket = require('ws');
const url = 'wss://ninedartnation-1.onrender.com/ws';
console.log(new Date().toISOString(), 'Connecting to', url);
const ws = new WebSocket(url);

const interesting = new Set(['cam-code','cam-peer-joined','cam-offer','cam-answer','cam-ice','ndn:darts-cleared','state','celebration','presence','chat']);

function safePrint(msg) {
  try {
    console.log(new Date().toISOString(), msg);
  } catch(e) { console.log(msg) }
}

ws.on('open', () => {
  safePrint('[ws_watch_remote] connected')
});

ws.on('message', (data) => {
  const s = (data || '').toString();
  try {
    const j = JSON.parse(s);
    const t = typeof j.type === 'string' ? j.type : null;
    if (t && (interesting.has(t) || t.startsWith('cam') || t.startsWith('ndn:'))) {
      safePrint('[ws_watch_remote] MSG: ' + JSON.stringify(j));
    }
  } catch (e) {
    // Raw non-JSON messages — print if they contain an interesting marker
    const lower = s.toLowerCase();
    if (lower.includes('cam') || lower.includes('ndn:') || lower.includes('darts')) {
      safePrint('[ws_watch_remote] RAW: ' + s);
    }
  }
});

ws.on('close', (code, reason) => safePrint('[ws_watch_remote] closed ' + code + ' ' + (reason && reason.toString())));
ws.on('error', (err) => safePrint('[ws_watch_remote] error ' + (err && err.message ? err.message : String(err))));

// keep alive
setInterval(()=>{}, 60_000);
