/*
  scripts/test_redis.js
  - Tries to connect to Redis using Upstash REST env vars (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
  - Falls back to using REDIS_URL with the @upstash/redis client when possible
  - If neither is available, prints instructions and exits with failure code
*/

(async () => {
  try {
    console.log('Starting Redis connectivity test...');

    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const redisUrl = process.env.REDIS_URL;

    if (!upstashUrl && !redisUrl) {
      console.error('No UPSTASH_REDIS_REST_URL or REDIS_URL found in environment. Set one to test connectivity.');
      process.exitCode = 2;
      return;
    }

    // Prefer Upstash REST SDK if REST vars provided
    if (upstashUrl && upstashToken) {
      console.log('Using @upstash/redis with REST credentials from UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
      const { Redis } = require('@upstash/redis');
      const client = new Redis({ url: upstashUrl, token: upstashToken });
      try {
        const ping = await client.ping();
        console.log('[Upstash] ping:', ping);
        const testKey = `ndn_test_${Date.now()}`;
        const setRes = await client.set(testKey, '1');
        console.log('[Upstash] set:', setRes);
        const getRes = await client.get(testKey);
        console.log('[Upstash] get:', getRes);
        const delRes = await client.del(testKey);
        console.log('[Upstash] del:', delRes);
        console.log('Upstash REST Redis test succeeded.');
        process.exitCode = 0;
        return;
      } catch (err) {
        console.error('Upstash REST test failed:', err?.message || err);
        process.exitCode = 3;
        return;
      }
    }

    // Fallback: try using @upstash/redis with REDIS_URL (some environments expose a compatible endpoint)
    if (redisUrl) {
      console.log('REDIS_URL provided. Attempting to use @upstash/redis with REDIS_URL (may work for Upstash-style credentials).');
      try {
        const { Redis } = require('@upstash/redis');
        const client = new Redis({ url: redisUrl });
        const ping = await client.ping();
        console.log('[Redis] ping:', ping);
        const testKey = `ndn_test_${Date.now()}`;
        await client.set(testKey, '1');
        const getRes = await client.get(testKey);
        console.log('[Redis] get:', getRes);
        await client.del(testKey);
        console.log('Redis test (via @upstash/redis) succeeded.');
        process.exitCode = 0;
        return;
      } catch (err) {
        console.error('Attempt using @upstash/redis with REDIS_URL failed:', err?.message || err);
      }

      // Last resort: try node-redis if available
      try {
        console.log('Attempting to use node-redis (redis package) as a fallback');
        const redis = require('redis');
        const client = redis.createClient({ url: redisUrl });
        client.on('error', (e) => console.error('[node-redis] error:', e.message || e));
        await client.connect();
        const pong = await client.ping();
        console.log('[node-redis] ping:', pong);
        const testKey = `ndn_test_${Date.now()}`;
        await client.set(testKey, '1');
        const val = await client.get(testKey);
        console.log('[node-redis] get:', val);
        await client.del(testKey);
        await client.disconnect();
        console.log('node-redis connectivity test succeeded.');
        process.exitCode = 0;
        return;
      } catch (err) {
        console.error('node-redis fallback failed (is the "redis" package installed?):', err?.message || err);
        process.exitCode = 4;
        return;
      }
    }

    console.error('No suitable Redis connection method succeeded.');
    process.exitCode = 5;
  } catch (err) {
    console.error('Unexpected error in test_redis.js:', err);
    process.exitCode = 99;
  }
})();
