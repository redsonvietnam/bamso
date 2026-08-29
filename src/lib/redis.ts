import Redis from 'ioredis';
import { logger } from '@/lib/logger';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy(times: number) {
        if (times > 10) {
            logger.error('Redis: max retry attempts reached, giving up');
            return null;
        }
        const delay = Math.min(times * 200, 5000);
        return delay;
    },
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
};

declare global {
    var _redisClient: Redis | undefined;
    var _redisPubSubClient: Redis | undefined;
}

function createRedisClient(): Redis {
    const client = new Redis(redisConfig);

    client.on('error', (err) => {
        logger.error('Redis connection error:', err);
    });

    client.on('connect', () => {
        logger.log('Redis connected');
    });

    return client;
}

export function getRedisClient(): Redis | null {
    if (!process.env.REDIS_HOST) return null;
    if (!global._redisClient) {
        global._redisClient = createRedisClient();
    }
    return global._redisClient;
}

export function getRedisPubSubClient(): Redis | null {
    if (!process.env.REDIS_HOST) return null;
    if (!global._redisPubSubClient) {
        global._redisPubSubClient = createRedisClient();
    }
    return global._redisPubSubClient;
}
