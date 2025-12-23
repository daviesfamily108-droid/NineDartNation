const fs = require('fs');
const path = require('path');

const matchesPath = path.join(__dirname, '..', 'server', 'data', 'matches.json');
const tournamentsPath = path.join(__dirname, '..', 'server', 'data', 'tournaments.json');

function clearFile(filePath, name) {
  try {
    if (fs.existsSync(filePath)) {
      console.log(`Found ${name}, clearing it...`);
      fs.writeFileSync(filePath, '[]', 'utf8');
      console.log(`All ${name} deleted.`);
    } else {
      console.log(`${name} file not found.`);
    }
  } catch (err) {
    console.error(`Error deleting ${name}:`, err);
  }
}

clearFile(matchesPath, 'matches');
clearFile(tournamentsPath, 'tournaments');
