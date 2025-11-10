const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8787;
const BASE = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/ws`;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

function wait(ms){ return new Promise(r=>setTimeout(r, ms)) }

function fetchJson(url, opts={}){
  return new Promise((resolve, reject)=>{
    const lib = url.startsWith('https') ? https : http;
    const u = new URL(url);
    const data = opts.body ? JSON.stringify(opts.body) : null;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const req = lib.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search||''), method: opts.method || 'GET', headers }, res=>{
      let buf = '';
      res.on('data', c=>buf+=c);
      res.on('end', ()=>{
        try { const json = JSON.parse(buf || '{}'); resolve({ status: res.statusCode, body: json }) } catch(e){ resolve({ status: res.statusCode, body: buf }) }
      })
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  })
}

(async ()=>{
  console.log('Starting E2E help smoke test against', BASE, WS_URL);
  const adminEmail = 'daviesfamily108@gmail.com';
  const adminToken = jwt.sign({ email: adminEmail, username: 'owner' }, JWT_SECRET, { expiresIn: '1h' });
  const userEmail = 'tester@example.com';
  const userToken = jwt.sign({ email: userEmail, username: 'tester' }, JWT_SECRET, { expiresIn: '1h' });

  // Connect admin WS
  const adminWs = new WebSocket(WS_URL);
  adminWs.on('open', ()=>{
    console.log('[adminWS] open -> sending presence with token');
    adminWs.send(JSON.stringify({ type: 'presence', username: 'owner', token: adminToken }));
  });
  adminWs.on('message', (m)=>{ try{ const d=JSON.parse(m.toString()); console.log('[adminWS] recv', d); }catch(e){ console.log('[adminWS]recv raw', m.toString()) } });
  adminWs.on('error', (e)=>console.error('[adminWS] err', e));

  // Connect user WS
  const userWs = new WebSocket(WS_URL);
  userWs.on('open', ()=>{
    console.log('[userWS] open -> sending presence with token');
    userWs.send(JSON.stringify({ type: 'presence', username: 'tester', email: userEmail, token: userToken }));
  });
  userWs.on('message', (m)=>{ try{ const d=JSON.parse(m.toString()); console.log('[userWS] recv', d); }catch(e){ console.log('[userWS]recv raw', m.toString()) } });
  userWs.on('error', (e)=>console.error('[userWS] err', e));

  // wait for connections
  await wait(800);

  // Create help request as user (with token)
  console.log('[test] Creating help request via REST');
  const create = await fetchJson(`${BASE}/api/help/requests`, { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: { message: 'Need admin help for E2E smoke' } });
  console.log('[test] create response', create.status, create.body);
  if (!create.body || !create.body.request) {
    console.error('Failed to create help request; aborting'); process.exit(1);
  }
  const id = create.body.request.id;

  // Give server a moment to broadcast
  await wait(500);

  // Admin polls list
  console.log('[test] Admin GET /api/admin/help-requests');
  const list = await fetchJson(`${BASE}/api/admin/help-requests`, { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log('[test] admin list', list.status, list.body.requests && list.body.requests.length);

  // Admin claim via REST
  console.log('[test] Admin claim request', id);
  const claim = await fetchJson(`${BASE}/api/admin/help-requests/${encodeURIComponent(id)}/claim`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: {} });
  console.log('[test] claim resp', claim.status, claim.body);

  await wait(300);

  // User sends a message via WS (help-message)
  console.log('[test] userWS send help-message');
  userWs.send(JSON.stringify({ type: 'help-message', requestId: id, message: 'Hello admin, I need help' }));

  await wait(300);

  // Admin sends a message via WS
  console.log('[test] adminWS send help-message');
  adminWs.send(JSON.stringify({ type: 'help-message', requestId: id, message: 'Hi tester, I am looking into it' }));

  await wait(300);

  // Admin resolve via REST
  console.log('[test] Admin resolve request', id);
  const resv = await fetchJson(`${BASE}/api/admin/help-requests/${encodeURIComponent(id)}/resolve`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: {} });
  console.log('[test] resolve resp', resv.status, resv.body);

  // Done
  await wait(500);
  console.log('E2E smoke test complete. Closing sockets.');
  try { adminWs.close(); userWs.close(); } catch(e){}
  process.exit(0);
})();
