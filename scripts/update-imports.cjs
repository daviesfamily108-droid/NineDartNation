const fs = require("fs");
const path = require("path");
const exts = [
  ".js",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".mp3",
  ".mp4",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".map",
];
const hasExt = (s) => exts.some((e) => s.endsWith(e));
const fix = (s) => {
  if (!s.startsWith(".")) return s;
  if (hasExt(s)) return s;
  return `${s}.js`;
};
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
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  const apply = (re) => {
    text = text.replace(re, (match, spec) => {
      const next = fix(spec);
      if (next !== spec) {
        changed = true;
        return match.replace(spec, next);
      }
      return match;
    });
  };
  apply(/from\s+["']([^"']+)["']/g);
  apply(/import\(\s*["']([^"']+)["']\s*\)/g);
  apply(/export\s+\*\s+from\s+["']([^"']+)["']/g);
  if (changed) fs.writeFileSync(file, text, "utf8");
}
console.log(`updated ${files.length} files`);
