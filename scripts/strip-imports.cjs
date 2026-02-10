const fs = require("fs");
const path = require("path");

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];
const resolveCandidates = (base) => [
  `${base}.ts`,
  `${base}.tsx`,
  `${base}.js`,
  `${base}.jsx`,
  path.join(base, "index.ts"),
  path.join(base, "index.tsx"),
  path.join(base, "index.js"),
  path.join(base, "index.jsx"),
];

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (sourceExtensions.some((ext) => entry.endsWith(ext))) files.push(full);
  }
};

walk(path.join(__dirname, "..", "src"));

const shouldStrip = (spec, fileDir) => {
  if (!spec.startsWith(".") || !spec.endsWith(".js")) return false;
  const base = path.resolve(fileDir, spec.slice(0, -3));
  return resolveCandidates(base).some((candidate) => fs.existsSync(candidate));
};

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;

  const replaceSpec = (match, spec) => {
    if (!shouldStrip(spec, path.dirname(file))) return match;
    const next = spec.slice(0, -3);
    changed = true;
    return match.replace(spec, next);
  };

  text = text.replace(/from\s+["']([^"']+)["']/g, replaceSpec);
  text = text.replace(/import\(\s*["']([^"']+)["']\s*\)/g, replaceSpec);
  text = text.replace(/export\s+\*\s+from\s+["']([^"']+)["']/g, replaceSpec);

  if (changed) fs.writeFileSync(file, text, "utf8");
}

console.log(`processed ${files.length} files`);
