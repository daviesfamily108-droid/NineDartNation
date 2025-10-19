#!/usr/bin/env node

// Redis Configuration Diagnostic Script
// Run with: node redis-check.js

const redis = require('redis');

console.log('🔍 Redis Configuration Diagnostic');
console.log('==================================');

const redisUrl = process.env.REDIS_URL;
console.log('REDIS_URL exists:', !!redisUrl);

if (redisUrl) {
  console.log('REDIS_URL length:', redisUrl.length);
  console.log('REDIS_URL starts with:', redisUrl.substring(0, 30) + '...');

  // Check if it has proper protocol
  const hasProtocol = redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://');
  console.log('Has proper protocol:', hasProtocol);

  if (!hasProtocol) {
    const fixedUrl = 'redis://' + redisUrl;
    console.log('Fixed URL would be:', fixedUrl.substring(0, 30) + '...');
  }

  // Try to create client
  try {
    const client = redis.createClient({ url: hasProtocol ? redisUrl : 'redis://' + redisUrl });
    console.log('✅ Client creation successful');

    // Try to connect (with timeout)
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );

    Promise.race([connectPromise, timeoutPromise])
      .then(() => {
        console.log('✅ Redis connection successful');
        client.quit();
        process.exit(0);
      })
      .catch(err => {
        console.log('❌ Redis connection failed:', err.message);
        process.exit(1);
      });

  } catch (err) {
    console.log('❌ Client creation failed:', err.message);
    process.exit(1);
  }

} else {
  console.log('ℹ️  No REDIS_URL configured - using in-memory storage');
  process.exit(0);
}