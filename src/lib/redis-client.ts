import Redis from 'ioredis';
import { logger } from '@/lib/logger';

const REDIS_URL = process.env.REDIS_URL || '';

let redis: Redis | null = null;
let redisSub: Redis | null = null;

export function isRedisAvailable(): boolean {
  return !!REDIS_URL;
}

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      logger.error('[Redis] Client error:', err.message);
    });

    redis.on('connect', () => {
      logger.log('[Redis] Client connected');
    });
  }
  return redis;
}

export function getRedisSubscriber(): Redis {
  if (!redisSub) {
    redisSub = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisSub.on('error', (err) => {
      logger.error('[Redis] Subscriber error:', err.message);
    });

    redisSub.on('connect', () => {
      logger.log('[Redis] Subscriber connected');
    });
  }
  return redisSub;
}

export async function connectRedis(): Promise<boolean> {
  if (!REDIS_URL) return false;
  try {
    await getRedisClient().connect();
    await getRedisSubscriber().connect();
    return true;
  } catch (err) {
    logger.error('[Redis] Connection failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisSub) {
    await redisSub.quit().catch(() => {});
    redisSub = null;
  }
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
}

export async function publish(channel: string, message: string): Promise<void> {
  if (!REDIS_URL) return;
  try {
    await getRedisClient().publish(channel, message);
  } catch {
    // Silently fail — fallback to in-memory
  }
}
