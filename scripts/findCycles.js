const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'src');
const exts = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir) {
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (stat.isFile() && exts.includes(path.extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function parseImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /import\s+(?:[^'";]+from\s+)?["']([^"']+)["']/g;
  const imports = [];
  let m;
  while ((m = re.exec(src))) {
    imports.push(m[1]);
  }
  return imports;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // ignore node_modules
  const base = path.dirname(fromFile);
  let candidate = path.resolve(base, spec);
  // try file
  for (const e of exts) {
    const f = candidate + e;
    if (fs.existsSync(f)) return f;
  }
  // try index
  for (const e of exts) {
    const f = path.join(candidate, 'index' + e);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

const files = walk(SRC);
const graph = new Map();
for (const f of files) graph.set(f, new Set());

for (const f of files) {
  const imports = parseImports(f);
  for (const imp of imports) {
    const resolved = resolveImport(f, imp);
    if (resolved && graph.has(resolved)) graph.get(f).add(resolved);
  }
}

// find cycles via DFS
const visited = new Set();
const stack = [];
const onStack = new Set();
const cycles = [];

function dfs(node) {
  visited.add(node);
  stack.push(node);
  onStack.add(node);
  for (const nbr of graph.get(node) || []) {
    if (!visited.has(nbr)) dfs(nbr);
    else if (onStack.has(nbr)) {
      // found cycle
      const idx = stack.indexOf(nbr);
      const cycle = stack.slice(idx).concat(nbr);
      cycles.push(cycle);
    }
  }
  stack.pop();
  onStack.delete(node);
}

for (const n of graph.keys()) {
  if (!visited.has(n)) dfs(n);
}

if (cycles.length === 0) {
  console.log('No cycles found (limited to relative imports in src).');
} else {
  console.log('Cycles found:');
  for (const c of cycles) {
    console.log('---');
    for (const p of c) console.log(path.relative(SRC, p));
  }
}
