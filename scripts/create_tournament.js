(async()=>{
  try{
    const d = Date.now() + 2*60*60*1000;
    const body = {
      title: 'Diag Official Tournament',
      game: 'X01',
      mode: 'bestof',
      value: 3,
      description: 'diagnostic create',
      startAt: d,
      checkinMinutes: 15,
      capacity: 8,
      creatorEmail: 'daviesfamily108@gmail.com',
      creatorName: 'Owner',
      requesterEmail: 'daviesfamily108@gmail.com',
      official: true
    };
    const res = await fetch('http://localhost:8787/api/tournaments/create', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    console.log('STATUS', res.status);
    const text = await res.text();
    try { console.log(JSON.parse(text)); } catch { console.log(text); }
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
