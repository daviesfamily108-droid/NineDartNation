const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'data', 'tournaments.json');

try {
  if (!fs.existsSync(filePath)) {
    console.log('No tournaments file found.');
    process.exit(0);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const tournaments = JSON.parse(raw);
  
  console.log(`Total tournaments before cleanup: ${tournaments.length}`);

  const filtered = tournaments.filter(t => {
    const title = (t.title || '').toLowerCase();
    // Remove if title contains "test" or "smoke"
    if (title.includes('test') || title.includes('smoke')) {
      return false;
    }
    return true;
  });

  console.log(`Total tournaments after cleanup: ${filtered.length}`);
  console.log(`Removed: ${tournaments.length - filtered.length}`);

  fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf8');
  console.log('Successfully cleaned tournaments.json');

} catch (err) {
  console.error('Error cleaning tournaments:', err);
}
