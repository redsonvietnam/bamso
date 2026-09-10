import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

// --- MFA Redis Key Prefixes ---
const KEY_PREFIX = 'bamso:mfa:';
const CHALLENGE_PREFIX = `${KEY_PREFIX}challenge:`;
const RATE_LIMIT_IP_PREFIX = `${KEY_PREFIX}rl:ip:`;
const ENROLLMENT_PREFIX = `${KEY_PREFIX}enrollment:`;

// --- Constants ---
export const CHALLENGE_EXPIRY_SECONDS = 300; // 5 minutes
export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCKOUT_SECONDS = 15 * 60; // 15 minutes
const ENROLLMENT_EXPIRY_SECONDS = 600; // 10 minutes

// --- Explicit Result Types ---

export type ClaimResult = 'CLAIMED' | 'ALREADY_CLAIMED' | 'STORAGE_ERROR';

export interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    retryAfterSeconds: number;
}

// --- Redis Availability Check ---

function getRedis() {
    return getRedisClient();
}

function resolveKey(prefix: string, rawKey: string): string {
    return rawKey.startsWith(KEY_PREFIX) ? rawKey : `${prefix}${rawKey}`;
}

// --- 1. Challenge JTI Claim (Atomic Replay Protection) ---

/**
 * Atomically claim a challenge JTI in Redis.
 * SET NX EX: only the first caller wins.
 *
 * CLAIMED — caller wins, JTI is now consumed
 * ALREADY_CLAIMED — another caller already consumed this JTI
 * STORAGE_ERROR — Redis unavailable or threw; fail closed
 */
export async function claimChallengeJti(
    jti: string,
    ttlSeconds: number = CHALLENGE_EXPIRY_SECONDS
): Promise<ClaimResult> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA challenge claim: Redis unavailable, failing closed');
        return 'STORAGE_ERROR';
    }

    try {
        const key = `${CHALLENGE_PREFIX}${jti}`;
        const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK' ? 'CLAIMED' : 'ALREADY_CLAIMED';
    } catch (error) {
        logger.error('MFA challenge claim Redis error:', error);
        return 'STORAGE_ERROR';
    }
}

// --- 2. MFA Rate Limiting (Shared Redis State) ---

/**
 * Single authoritative operation for recording a failed MFA attempt.
 * Atomically INCR + conditional EXPIRE. One failed request = one count.
 *
 * Returns the updated rate-limit state after the increment.
 * Redis unavailable → fail closed (denied).
 */
export async function recordMfaAttemptFailure(key: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA rate limit: Redis unavailable, failing closed');
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }

    const redisKey = resolveKey(RATE_LIMIT_IP_PREFIX, key);

    try {
        const count = await redis.incr(redisKey);

        if (count === 1) {
            await redis.expire(redisKey, MFA_LOCKOUT_SECONDS);
        }

        const ttl = await redis.ttl(redisKey);

        if (count >= MFA_MAX_FAILED_ATTEMPTS) {
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
 * Record a successful MFA attempt. Resets the rate-limit window.
 */
export async function recordMfaAttemptSuccess(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const redisKey = resolveKey(RATE_LIMIT_IP_PREFIX, key);

    try {
        await redis.del(redisKey);
    } catch (error) {
        logger.error('MFA record success Redis error:', error);
    }
}

/**
 * Check current rate-limit state WITHOUT mutating.
 * Used for pre-flight checks (e.g. IP-level gate before factor validation).
 */
export async function checkMfaRateLimitState(key: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }

    const redisKey = resolveKey(RATE_LIMIT_IP_PREFIX, key);

    try {
        const countStr = await redis.get(redisKey);
        const count = countStr ? parseInt(countStr, 10) : 0;

        if (count > MFA_MAX_FAILED_ATTEMPTS) {
            const ttl = await redis.ttl(redisKey);
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
        logger.error('MFA rate limit check Redis error:', error);
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }
}

// --- 3. Enrollment Token Claim (Atomic One-Time Use) ---

/**
 * Atomically claim an enrollment setup token JTI in Redis.
 *
 * CLAIMED — caller wins, token is now consumed
 * ALREADY_CLAIMED — another caller already consumed this token
 * STORAGE_ERROR — Redis unavailable or threw; fail closed
 */
export async function claimEnrollmentToken(
    jti: string,
    ttlSeconds: number = ENROLLMENT_EXPIRY_SECONDS
): Promise<ClaimResult> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA enrollment claim: Redis unavailable, failing closed');
        return 'STORAGE_ERROR';
    }

    try {
        const key = `${ENROLLMENT_PREFIX}${jti}`;
        const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK' ? 'CLAIMED' : 'ALREADY_CLAIMED';
    } catch (error) {
        logger.error('MFA enrollment claim Redis error:', error);
        return 'STORAGE_ERROR';
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
