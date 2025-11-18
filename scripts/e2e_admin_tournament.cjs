const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

async function main() {
  const ws = new WebSocket('ws://localhost:8787/ws');
  const dataFile = path.join(__dirname, '..', 'server', 'data', 'tournaments.json');
  let tournamentsMsg = null;
  const got = { id: null };
  ws.on('open', async () => {
    console.log('WS connected');
  });
  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      if (data.type === 'tournaments') {
        tournamentsMsg = data.tournaments || [];
        console.log('WS tournaments frame received; count=', tournamentsMsg.length);
      }
    } catch (err) { console.error('ws parse error', err) }
  });
  ws.on('error', (err) => { console.error('ws error', err) });

  // Wait for WS to be ready
  await new Promise((res) => ws.once('open', res));

  // Create a tournament via HTTP
  const body = {
    title: 'E2E-Test Tournament',
    game: 'X01',
    mode: 'bestof',
    value: 3,
    startAt: Date.now() + 10000,
    checkinMinutes: 10,
    capacity: 8,
    creatorEmail: 'daviesfamily108@gmail.com',
    creatorName: 'test-admin',
    requesterEmail: 'daviesfamily108@gmail.com'
  };
  console.log('Creating tournament via API...');
  const resp = await fetch('http://localhost:8787/api/tournaments/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await resp.json();
  if (!j || !j.ok || !j.tournament) {
    console.error('Create failed', j);
    process.exit(1);
  }
  // Check creatorName override for admin-created tournaments
  if (String(j.tournament.creatorName || '').toUpperCase() !== 'ADMIN') {
    console.error('Creator name was not overridden to ADMIN for owner/admin create:', j.tournament.creatorName)
    process.exit(1)
  }
  const tid = j.tournament.id;
  console.log('Created tournament id', tid);

  // Wait up to 5s for WS tournaments frame to include our tid
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (tournamentsMsg && tournamentsMsg.find(t => t.id === tid)) {
      console.log('WS broadcast received for tid', tid);
      break;
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Also check persistence file contains tournament id
  try {
    const raw = fs.readFileSync(dataFile, 'utf8') || '[]';
    const arr = JSON.parse(raw || '[]');
    const found = Array.isArray(arr) && arr.find(t => t.id === tid);
    if (found) console.log('Found tournament in persistence file')
    else console.warn('Tournament not found in persistence file yet')
  } catch (err) {
    console.warn('Failed to read persistence file', err.message)
  }

  ws.close()
}

main().catch(err => { console.error('E2E error', err); process.exit(2) })
