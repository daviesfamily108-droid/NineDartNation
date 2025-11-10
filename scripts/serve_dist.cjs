const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 5781;
const dist = path.resolve(__dirname, '..', 'dist');

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/octet-stream',
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
      // fallback to index.html for SPA
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

server.listen(port, () => console.log(`Serving dist at http://localhost:${port}`));

process.on('SIGTERM', () => server.close());
