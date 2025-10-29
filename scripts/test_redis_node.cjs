const { createClient } = require('redis');

(async () => {
  // Connection details provided by the user.
  const client = createClient({
    username: 'default',
    password: 'eKD5ftLfM0fNVeA2sjtetm9AfSSho9YU',
    socket: {
      host: 'redis-16644.c283.us-east-1-4.ec2.redns.redis-cloud.com',
      port: 16644,
      tls: true
    }
  });

  client.on('error', (err) => console.error('Redis Client Error', err));

  try {
    console.log('[test_redis_node] connecting...');
    await client.connect();
    console.log('[test_redis_node] connected');

    await client.set('foo', 'bar');
    const v = await client.get('foo');
    console.log('[test_redis_node] GET foo ->', v);

    await client.disconnect();
    console.log('[test_redis_node] disconnected');
    process.exit(0);
  } catch (err) {
    console.error('[test_redis_node] error', err);
    try { await client.disconnect(); } catch (e) {}
    process.exit(1);
  }
})();
