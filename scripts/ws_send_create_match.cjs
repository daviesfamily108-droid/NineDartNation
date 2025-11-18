const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8787/ws');
ws.on('open', () => {
  console.log('connected');
  ws.send(JSON.stringify({ type: 'create-match', game: 'X01', mode: 'bestof', value: 3, startingScore: 501 }));
  setTimeout(()=>{ws.send(JSON.stringify({ type: 'list-matches' }));}, 500);
});
ws.on('message', (msg) => { console.log('recv:', msg.toString()); });
ws.on('close', ()=>console.log('closed'));
ws.on('error', (err)=>console.error('err',err));
