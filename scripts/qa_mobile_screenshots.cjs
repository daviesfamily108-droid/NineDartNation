const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const dist = path.resolve(__dirname, '..', 'dist');
const port = process.env.PORT || 5781;

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  try {
    let reqPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(dist, reqPath.replace(/^\//, ''));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      const index = path.join(dist, 'index.html');
      if (fs.existsSync(index)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(index).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(err));
  }
});

server.listen(port, async () => {
  console.log(`Serving dist at http://localhost:${port}`);
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 390, height: 844, isMobile: true });

    const paths = ['/', '/online', '/offline', '/tournaments'];
    const outDir = path.join(__dirname, 'mobile_screens');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const p of paths) {
      const url = `http://localhost:${port}${p}`;
      console.log('Navigating to', url);
      const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      if (!resp) {
        console.warn('No response for', url);
      } else {
        console.log('Status', resp.status());
      }
  await new Promise(r => setTimeout(r, 500)); // let client render
      const filename = path.join(outDir, `${p === '/' ? 'home' : p.replace('\/','').replace(/\//g,'_')}.png`);
      await page.screenshot({ path: filename, fullPage: true });
      console.log('Saved', filename);
    }

    await browser.close();
  } catch (err) {
    console.error('Puppeteer failed:', err && err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});
