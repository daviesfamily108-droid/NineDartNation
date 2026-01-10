#!/usr/bin/env node
// Usage: node scripts/map-symbol.cjs <chunk-path> <symbol> [occurrenceIndex]
// Example: node scripts/map-symbol.cjs dist/assets/index-Cat8IE4a.js Ns 1

const fs = require('fs');
const path = require('path');
const sourceMap = require('source-map');

async function run() {
  const [,, chunkPath, symbol, occIdxRaw] = process.argv;
  if (!chunkPath || !symbol) {
    console.error('Usage: node scripts/map-symbol.cjs <chunk-path> <symbol> [occurrenceIndex]');
    process.exit(2);
  }
  const occIdx = occIdxRaw ? parseInt(occIdxRaw, 10) : 1;

  const chunk = fs.readFileSync(chunkPath, 'utf8');
  const mapPath = chunkPath + '.map';
  if (!fs.existsSync(mapPath)) {
    console.error('Source map not found for chunk:', mapPath);
    process.exit(2);
  }
  const mapRaw = fs.readFileSync(mapPath, 'utf8');
  const map = JSON.parse(mapRaw);

  // Find occurrences of the symbol in the chunk
  const regex = new RegExp('\\b' + symbol + '\\b', 'g');
  let match;
  const occurrences = [];
  while ((match = regex.exec(chunk)) !== null) {
    const index = match.index;
    // count line/column
    const before = chunk.slice(0, index);
    const lines = before.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1; // 1-based
    occurrences.push({ index, line, column });
  }

  if (occurrences.length === 0) {
    console.error('No occurrences of symbol', symbol, 'found in', chunkPath);
    process.exit(1);
  }

  const target = occurrences[Math.max(0, Math.min(occurrences.length - 1, occIdx - 1))];
  console.log('Found', occurrences.length, 'occurrences. Using occurrence', occIdx, '->', target);

  const consumer = await new sourceMap.SourceMapConsumer(map);
  try {
    const original = consumer.originalPositionFor({ line: target.line, column: target.column - 1 });
    console.log('Mapped to original:', original);
    if (original.source) {
      const srcRoot = map.sourceRoot || '';
      const srcPath = path.resolve(path.dirname(mapPath), srcRoot, original.source);
      console.log('Original file path (resolved):', srcPath);
      if (fs.existsSync(srcPath)) {
        const src = fs.readFileSync(srcPath, 'utf8');
        const srcLines = src.split('\n');
        const from = Math.max(0, original.line - 5);
        const to = Math.min(srcLines.length, original.line + 5);
        console.log('\nContext around original location:');
        for (let i = from; i < to; i++) {
          const mark = i + 1 === original.line ? '>>' : '  ';
          console.log(mark, String(i + 1).padStart(4), srcLines[i]);
        }
      } else {
        console.warn('Original source file not found at resolved path. Source maps may contain sourcesContent.');
        if (map.sourcesContent && map.sourcesContent.length) {
          const idx = map.sources.indexOf(original.source);
          if (idx >= 0 && map.sourcesContent[idx]) {
            console.log('\nFound sourcesContent for', original.source, ':');
            const src = map.sourcesContent[idx];
            const srcLines = src.split('\n');
            const from = Math.max(0, original.line - 5);
            const to = Math.min(srcLines.length, original.line + 5);
            for (let i = from; i < to; i++) {
              const mark = i + 1 === original.line ? '>>' : '  ';
              console.log(mark, String(i + 1).padStart(4), srcLines[i]);
            }
          }
        }
      }
    }
  } finally {
    consumer.destroy && consumer.destroy();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(2);
});
