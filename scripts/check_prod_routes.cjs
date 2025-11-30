(async ()=>{
  const port = process.env.PORT || 5781;
  const base = `http://localhost:${port}`;
  const urls = [base+'/', base+'/online', base+'/offline', base+'/tournaments'];
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
