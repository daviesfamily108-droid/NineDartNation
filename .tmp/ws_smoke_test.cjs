const WebSocket = require('ws');

function info(...a){ console.log('[TEST]', ...a) }

const URL = process.env.WS_URL || 'ws://localhost:8787/ws'

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)) }

(async ()=>{
  info('connecting desktop')
  const desktop = new WebSocket(URL)
  desktop.on('open', ()=> info('desktop open'))
  desktop.on('message', (m)=> info('desktop rx', m.toString()))
  desktop.on('close', ()=> info('desktop close'))

  await new Promise(r=>desktop.on('open', r))

  info('desktop: send cam-create')
  desktop.send(JSON.stringify({ type: 'cam-create', persistent: false }))

  let code = null

  desktop.on('message', (m)=>{
    try{
      const d = JSON.parse(m.toString())
      if(d.type === 'cam-code'){ code = d.code; info('desktop got code', code) }
      if(d.type === 'cam-peer-joined'){ info('desktop noticed peer joined', d.code) }
    }catch(e){ }
  })

  // wait a bit for server to respond with cam-code
  for(let i=0;i<20;i++){
    if(code) break
    await wait(200)
  }
  if(!code){ info('NO CODE - abort'); process.exit(2) }

  info('connecting phone (will join code', code, ')')
  const phone = new WebSocket(URL)
  phone.on('open', ()=> info('phone open; will send cam-join'))
  phone.on('message', (m)=> info('phone rx', m.toString()))
  phone.on('close', ()=> info('phone close'))

  await new Promise(r=>phone.on('open', r))

  phone.send(JSON.stringify({ type: 'cam-join', code }))

  // Wait and then emulate desktop creating an offer (we'll send a dummy SDP)
  await wait(500)
  const fakeOffer = { type: 'offer', sdp: 'v=0\no=- 0 0 IN IP4 127.0.0.1\n' }
  info('desktop send cam-offer')
  desktop.send(JSON.stringify({ type: 'cam-offer', code, payload: fakeOffer }))

  // Wait to see if phone receives it
  await wait(1000)

  info('phone send cam-answer back')
  const fakeAnswer = { type: 'answer', sdp: 'v=0\no=- 0 0 IN IP4 127.0.0.1\n' }
  phone.send(JSON.stringify({ type: 'cam-answer', code, payload: fakeAnswer }))

  await wait(1000)
  info('done')
  phone.close(); desktop.close();
  process.exit(0)
})().catch(e=>{ console.error(e); process.exit(1) })
