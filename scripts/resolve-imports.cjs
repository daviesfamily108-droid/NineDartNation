const fs = require("fs");
const path = require("path");

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(full);
  }
};

walk(path.join(__dirname, "..", "src"));

const resolveWithExtension = (spec, fileDir) => {
  if (!spec.startsWith(".")) return spec;
  if (path.extname(spec)) return spec;

  const base = path.resolve(fileDir, spec);
  for (const ext of sourceExtensions) {
    const candidate = `${base}${ext}`;
    if (fs.existsSync(candidate)) return `${spec}${ext}`;
  }

  for (const ext of sourceExtensions) {
    const candidate = path.join(base, `index${ext}`);
    if (fs.existsSync(candidate)) return `${spec}/index${ext}`;
  }

  return spec;
};

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  const replaceSpec = (match, spec) => {
    const next = resolveWithExtension(spec, path.dirname(file));
    if (next !== spec) {
      changed = true;
      return match.replace(spec, next);
    }
    return match;
  };

  text = text.replace(/from\s+["']([^"']+)["']/g, replaceSpec);
  text = text.replace(/import\(\s*["']([^"']+)["']\s*\)/g, replaceSpec);
  text = text.replace(/export\s+\*\s+from\s+["']([^"']+)["']/g, replaceSpec);

  if (changed) fs.writeFileSync(file, text, "utf8");
}

console.log(`processed ${files.length} files`);
