import redis from '@/lib/redis';
import { logger } from '@/lib/logger';

interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

/**
 * Atomically increment a fixed-window counter and set its TTL only on the
 * first request. Resetting EXPIRE on every request would turn a fixed window
 * into a rolling window that can be kept alive indefinitely by steady traffic.
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local maxRequests = tonumber(ARGV[2])
local remaining = math.max(0, maxRequests - count)
if count <= maxRequests then
    return {1, remaining}
end
return {0, remaining}
`;

/**
 * Rate limiter backed by Redis.
 * Fail-open: if Redis is down, the request is allowed through with a log warning.
 * RATE_LIMIT_DISABLED is honored outside production only.
 */
export async function checkRateLimit(
    key: string,
    config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number }> {
    // Never allow a production deployment to accidentally disable protection.
    if (process.env.RATE_LIMIT_DISABLED === 'true' && process.env.NODE_ENV !== 'production') {
        return { allowed: true, remaining: config.maxRequests };
    }

    try {
        const { windowMs, maxRequests } = config;
        if (windowMs <= 0 || maxRequests <= 0) {
            throw new Error('Invalid rate limit configuration');
        }

        const redisKey = `ratelimit:${key}`;
        const result = await redis.eval(
            RATE_LIMIT_SCRIPT,
            1,
            redisKey,
            String(windowMs),
            String(maxRequests)
        ) as [number, number];

        const [allowed, remaining] = result;
        return { allowed: allowed === 1, remaining };
    } catch (error) {
        // Fail-open: log error and allow request through
        logger.error('Rate limit check failed (fail-open):', error);
        return { allowed: true, remaining: 0 };
    }
}

/**
 * Get client IP from request headers.
 * x-forwarded-for is expected to be supplied by the trusted reverse proxy.
 */
export function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return request.headers.get('x-real-ip') || 'unknown';
}

// Predefined rate limit configs
export const RATE_LIMITS = {
    tts: { windowMs: 60_000, maxRequests: 100 },
    tickets: { windowMs: 60_000, maxRequests: 200 },
    auth: { windowMs: 60_000, maxRequests: 50 },
    demoToken: { windowMs: 60_000, maxRequests: 10 },
} as const;
