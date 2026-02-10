const fs = require("fs");
const path = require("path");

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

const stripExt = (spec) => {
  if (!spec.startsWith(".")) return spec;
  if (spec.endsWith(".ts") || spec.endsWith(".tsx") || spec.endsWith(".jsx") || spec.endsWith(".js")) {
    return spec.replace(/\.(ts|tsx|js|jsx)$/i, "");
  }
  return spec;
};

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  const replaceSpec = (match, spec) => {
    const next = stripExt(spec);
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
