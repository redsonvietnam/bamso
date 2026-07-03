import Redis from 'ioredis';

/**
 * Redis connection singleton.
 * We use a global variable to prevent multiple connections during Next.js HMR in development.
 */
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

declare global {
  var redis: Redis | undefined;
  var redisPubSub: Redis | undefined;
}

// Main client for publishing and general commands
export const redis = global.redis || new Redis(redisConfig);
if (process.env.NODE_ENV !== 'production') global.redis = redis;

// Dedicated client for subscribing (Redis requires a dedicated connection for subscribe)
export const redisPubSub = global.redisPubSub || new Redis(redisConfig);
if (process.env.NODE_ENV !== 'production') global.redisPubSub = redisPubSub;

export default redis;
