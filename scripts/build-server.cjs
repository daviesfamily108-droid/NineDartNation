#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src', 'server', 'server.cjs');
const outDir = path.join(root, 'server');
const outFile = path.join(outDir, 'server.js');

if (!fs.existsSync(entry)) {
  console.error('[build-server] Missing entry file:', entry);
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

try {
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node18'],
    outfile: outFile,
    banner: { js: '#!/usr/bin/env node' },
    external: [],
    logLevel: 'info',
  });
  console.log('[build-server] Wrote', outFile);
} catch (err) {
  console.error('[build-server] Build failed:', err);
  process.exit(1);
}
