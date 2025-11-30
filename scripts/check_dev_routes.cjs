(async ()=>{
  const urls = ['http://localhost:5173/','http://localhost:5173/online','http://localhost:5173/offline','http://localhost:5173/tournaments'];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      console.log('\nURL:', u, 'STATUS:', r.status);
      const t = await r.text();
      console.log('SNIPPET:', t.slice(0,400).replace(/\n/g,' '));
    } catch (e) {
      console.error('\nERROR fetching', u, e && e.message);
    }
  }
  process.exit(0);
})();
