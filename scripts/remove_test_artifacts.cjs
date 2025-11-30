#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'server', 'data');
const tournamentsPath = path.join(dataDir, 'tournaments.json');
const matchesPath = path.join(dataDir, 'matches.json');

function backup(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = filePath + '.bak.' + ts;
    fs.copyFileSync(filePath, dest);
    return dest;
  } catch (err) {
    console.error('Backup failed for', filePath, err.message);
    return null;
  }
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Failed to parse', p, err.message);
    return null;
  }
}

function writeJson(p, arr) {
  fs.writeFileSync(p, JSON.stringify(arr, null, 2), 'utf8');
}

const removedFiles = [];

// Backup
const tBak = backup(tournamentsPath);
const mBak = backup(matchesPath);
if (tBak) console.log('Tournaments backed up to', tBak);
if (mBak) console.log('Matches backed up to', mBak);

// Clean tournaments: remove titles starting with "Integration-" (case-insensitive)
const tournaments = loadJson(tournamentsPath) || [];
const beforeT = tournaments.length;
const filteredT = tournaments.filter(t => {
  const title = String(t.title || '');
  return !title.toLowerCase().startsWith('integration-');
});
writeJson(tournamentsPath, filteredT);
console.log(`Tournaments: ${beforeT} -> ${filteredT.length} (removed ${beforeT - filteredT.length})`);

// Clean matches: remove matches created by obvious test accounts
const matches = loadJson(matchesPath) || [];
const beforeM = matches.length;
const filteredM = matches.filter(m => {
  const name = String(m.creatorName || '').toLowerCase();
  // remove creatorName exactly 'alice' or starting with 'user-'
  if (name === 'alice') return false;
  if (name.startsWith('user-')) return false;
  return true;
});
writeJson(matchesPath, filteredM);
console.log(`Matches: ${beforeM} -> ${filteredM.length} (removed ${beforeM - filteredM.length})`);

// Delete repo test files (if present)
const toDelete = [
  path.join(root, 'old_onlineplay_commit.txt'),
  path.join(root, 'onlineplay_4a2252e.txt'),
  path.join(root, 'test_friends.cjs'),
  path.join(root, 'tmp_signup.json'),
  path.join(root, 'scripts', 'e2e_admin_tournament.cjs')
];
for (const f of toDelete) {
  try {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      removedFiles.push(path.relative(root, f));
      console.log('Deleted', f);
    }
  } catch (err) {
    console.warn('Failed to delete', f, err.message);
  }
}

console.log('Removed files:', removedFiles);
console.log('Cleanup complete.');
