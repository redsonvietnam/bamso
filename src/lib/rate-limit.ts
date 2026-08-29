import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

/**
 * Rate limiter backed by Redis (INCR + EXPIRE).
 * Fail-open: if Redis is down, the request is allowed through with a log warning.
 * Skipped entirely if RATE_LIMIT_DISABLED=true.
 */
export async function checkRateLimit(
    key: string,
    config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number }> {
    // Allow disabling rate limit via env var (useful for dev/testing)
    if (process.env.RATE_LIMIT_DISABLED === 'true') {
        return { allowed: true, remaining: config.maxRequests };
    }

    try {
        const { windowMs, maxRequests } = config;
        const windowSeconds = Math.ceil(windowMs / 1000);
        const redisKey = `ratelimit:${key}`;

        const redis = getRedisClient();
        if (!redis) return { allowed: true, remaining: maxRequests };

        const pipeline = redis.pipeline();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, windowSeconds);
        const results = await pipeline.exec();

        if (!results) {
            return { allowed: true, remaining: maxRequests };
        }

        const count = results[0][1] as number;
        const remaining = Math.max(0, maxRequests - count);

        return { allowed: count <= maxRequests, remaining };
    } catch (error) {
        // Fail-open: log error and allow request through
        logger.error('Rate limit check failed (fail-open):', error);
        return { allowed: true, remaining: 0 };
    }
}

/**
 * Get client IP from request headers.
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
    track: { windowMs: 60_000, maxRequests: 100 },
    auth: { windowMs: 60_000, maxRequests: 50 },
    demoToken: { windowMs: 60_000, maxRequests: 10 },
} as const;
