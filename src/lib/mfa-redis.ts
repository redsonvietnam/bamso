import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

// --- MFA Redis Key Prefixes ---
const KEY_PREFIX = 'bamso:mfa:';
const CHALLENGE_PREFIX = `${KEY_PREFIX}challenge:`;
const RATE_LIMIT_IP_PREFIX = `${KEY_PREFIX}rl:ip:`;
const ENROLLMENT_PREFIX = `${KEY_PREFIX}enrollment:`;

// --- Constants ---
const CHALLENGE_EXPIRY_SECONDS = 300; // 5 minutes
const MFA_MAX_FAILED_ATTEMPTS = 5;
const MFA_LOCKOUT_SECONDS = 15 * 60; // 15 minutes

// --- Types ---
export interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    retryAfterSeconds: number;
}

// --- Redis Availability Check ---
function getRedis() {
    return getRedisClient();
}

// --- 1. Challenge JTI Claim (Atomic Replay Protection) ---

/**
 * Atomically claim a challenge JTI in Redis.
 * SET NX EX: only the first caller wins.
 * Redis unavailable → fail closed (return false).
 */
export async function claimChallengeJti(jti: string, ttlSeconds: number = CHALLENGE_EXPIRY_SECONDS): Promise<boolean> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA challenge claim: Redis unavailable, failing closed');
        return false;
    }

    try {
        const key = `${CHALLENGE_PREFIX}${jti}`;
        const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    } catch (error) {
        logger.error('MFA challenge claim Redis error:', error);
        return false;
    }
}

// --- 2. MFA Rate Limiting (Shared Redis State) ---

/**
 * Check MFA rate limit using Redis atomic operations.
 * Uses INCR + EXPIRE for TTL-based window.
 * Redis unavailable → fail closed (deny).
 */
export async function checkMfaRateLimitRedis(key: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA rate limit check: Redis unavailable, failing closed');
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }

    const redisKey = key.startsWith(KEY_PREFIX) ? key : `${RATE_LIMIT_IP_PREFIX}${key}`;

    try {
        const count = await redis.incr(redisKey);

        if (count === 1) {
            // First attempt in this window — set TTL
            await redis.expire(redisKey, MFA_LOCKOUT_SECONDS);
        }

        const ttl = await redis.ttl(redisKey);

        if (count > MFA_MAX_FAILED_ATTEMPTS) {
            return {
                allowed: false,
                remainingAttempts: 0,
                retryAfterSeconds: ttl > 0 ? ttl : MFA_LOCKOUT_SECONDS,
            };
        }

        return {
            allowed: true,
            remainingAttempts: Math.max(0, MFA_MAX_FAILED_ATTEMPTS - count),
            retryAfterSeconds: 0,
        };
    } catch (error) {
        logger.error('MFA rate limit Redis error:', error);
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }
}

/**
 * Record an MFA attempt in Redis.
 * On success: delete the key (reset window).
 * On failure: INCR + EXPIRE.
 */
export async function recordMfaAttemptRedis(key: string, success: boolean): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const redisKey = key.startsWith(KEY_PREFIX) ? key : `${RATE_LIMIT_IP_PREFIX}${key}`;

    try {
        if (success) {
            await redis.del(redisKey);
        } else {
            const count = await redis.incr(redisKey);
            if (count === 1) {
                await redis.expire(redisKey, MFA_LOCKOUT_SECONDS);
            }
        }
    } catch (error) {
        logger.error('MFA record attempt Redis error:', error);
    }
}

// --- 3. Enrollment Token Claim (Atomic One-Time Use) ---

/**
 * Atomically claim an enrollment setup token JTI in Redis.
 * Prevents replay of enrollment tokens.
 * Redis unavailable → fail closed (return false).
 */
export async function claimEnrollmentToken(jti: string, ttlSeconds: number = 600): Promise<boolean> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA enrollment claim: Redis unavailable, failing closed');
        return false;
    }

    try {
        const key = `${ENROLLMENT_PREFIX}${jti}`;
        const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    } catch (error) {
        logger.error('MFA enrollment claim Redis error:', error);
        return false;
    }
}

// --- 4. Cleanup (for tests) ---

/**
 * Reset all MFA Redis keys. Used in tests only.
 */
export async function resetMfaRedisState(): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
        const keys = await redis.keys(`${KEY_PREFIX}*`);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch (error) {
        logger.error('MFA Redis reset error:', error);
    }
}
