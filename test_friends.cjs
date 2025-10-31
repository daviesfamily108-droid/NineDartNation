const http = require('http');

function testEndpoint(url, name) {
  return new Promise((resolve, reject) => {
    console.log(`Testing ${name} at ${url}...`);
    const req = http.get(url, (res) => {
      console.log(`Status: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`${name}: ${data}`);
        resolve(data);
      });
    });
    req.on('error', (err) => {
      console.error(`Error testing ${name}:`, err.message);
      console.error('Full error:', err);
      reject(err);
    });
    req.setTimeout(5000, () => {
      console.error(`Timeout testing ${name}`);
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function testFriendsEndpoints() {
  try {
    await testEndpoint('http://localhost:8787/api/friends/requests', 'Friends requests');
    await testEndpoint('http://localhost:8787/api/friends/messages', 'Friends messages');
    console.log('All friends endpoints tested successfully!');
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

testFriendsEndpoints();