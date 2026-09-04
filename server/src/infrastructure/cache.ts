import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const cache = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 100, 2000);
  },
});
cache.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[Redis Cache] Connection warning: ${err.message}`);
  }
});

export const workerConnection = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 100, 2000);
  },
});
workerConnection.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[Redis Queue] Connection warning: ${err.message}`);
  }
});
