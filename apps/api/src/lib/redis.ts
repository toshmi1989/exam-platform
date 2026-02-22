import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => {
    if (times > 10) return null; // stop retrying after 10 attempts
    return Math.min(times * 200, 3000);
  },
});

redis.on('error', (err: Error) => {
  console.error('[Redis] connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] connected');
});

redis.on('reconnecting', () => {
  console.log('[Redis] reconnecting...');
});

export default redis;
