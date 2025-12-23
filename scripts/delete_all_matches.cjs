const fs = require('fs');
const path = require('path');

const matchesPath = path.join(__dirname, '..', 'server', 'data', 'matches.json');

try {
  if (fs.existsSync(matchesPath)) {
    console.log('Found matches.json, clearing it...');
    fs.writeFileSync(matchesPath, '[]', 'utf8');
    console.log('All matches deleted.');
  } else {
    console.log('matches.json not found.');
  }
} catch (err) {
  console.error('Error deleting matches:', err);
}
