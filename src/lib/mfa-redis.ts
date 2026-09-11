import crypto from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

// --- MFA Redis Key Prefixes ---
const KEY_PREFIX = 'bamso:mfa:';
const CHALLENGE_PREFIX = `${KEY_PREFIX}challenge:`;
const RATE_LIMIT_IP_PREFIX = `${KEY_PREFIX}rl:ip:`;
const ENROLLMENT_PREFIX = `${KEY_PREFIX}enrollment:`;
const REGEN_LOCK_PREFIX = `${KEY_PREFIX}regen:`;
const REGEN_FENCE_PREFIX = `${KEY_PREFIX}regen-fence:`;

// --- Constants ---
export const CHALLENGE_EXPIRY_SECONDS = 300;
export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCKOUT_SECONDS = 15 * 60;
const ENROLLMENT_EXPIRY_SECONDS = 600;
export const REGEN_LOCK_TTL_SECONDS = 30;

// --- Explicit Result Types ---
export type ClaimResult = 'CLAIMED' | 'ALREADY_CLAIMED' | 'STORAGE_ERROR';

export interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    retryAfterSeconds: number;
}

export interface RegenLock {
    ownerToken: string;
    fenceToken: number;
}

function getRedis() {
    return getRedisClient();
}

function resolveKey(prefix: string, rawKey: string): string {
    return rawKey.startsWith(KEY_PREFIX) ? rawKey : `${prefix}${rawKey}`;
}

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

export async function recordMfaAttemptFailure(key: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA rate limit: Redis unavailable, failing closed');
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }
    const redisKey = resolveKey(RATE_LIMIT_IP_PREFIX, key);
    try {
        const count = await redis.incr(redisKey);
        if (count === 1) await redis.expire(redisKey, MFA_LOCKOUT_SECONDS);
        const ttl = await redis.ttl(redisKey);
        if (count >= MFA_MAX_FAILED_ATTEMPTS) {
            return { allowed: false, remainingAttempts: 0, retryAfterSeconds: ttl > 0 ? ttl : MFA_LOCKOUT_SECONDS };
        }
        return { allowed: true, remainingAttempts: Math.max(0, MFA_MAX_FAILED_ATTEMPTS - count), retryAfterSeconds: 0 };
    } catch (error) {
        logger.error('MFA rate limit Redis error:', error);
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }
}

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

export async function checkMfaRateLimitState(key: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    const redisKey = resolveKey(RATE_LIMIT_IP_PREFIX, key);
    try {
        const countStr = await redis.get(redisKey);
        const count = countStr ? parseInt(countStr, 10) : 0;
        if (count >= MFA_MAX_FAILED_ATTEMPTS) {
            const ttl = await redis.ttl(redisKey);
            return { allowed: false, remainingAttempts: 0, retryAfterSeconds: ttl > 0 ? ttl : MFA_LOCKOUT_SECONDS };
        }
        return { allowed: true, remainingAttempts: Math.max(0, MFA_MAX_FAILED_ATTEMPTS - count), retryAfterSeconds: 0 };
    } catch (error) {
        logger.error('MFA rate limit check Redis error:', error);
        return { allowed: false, remainingAttempts: 0, retryAfterSeconds: MFA_LOCKOUT_SECONDS };
    }
}

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

// --- 4. Recovery Code Regeneration Lock ---
// Redis provides lease ownership; the monotonic fence token is persisted and
// checked at the SQLite mutation boundary so an expired holder cannot mutate.
export async function acquireRegenLock(userId: string): Promise<RegenLock | 'ALREADY_CLAIMED' | 'STORAGE_ERROR'> {
    const redis = getRedis();
    if (!redis) {
        logger.error('MFA regen lock: Redis unavailable, failing closed');
        return 'STORAGE_ERROR';
    }

    try {
        const key = `${REGEN_LOCK_PREFIX}${userId}`;
        const fenceKey = `${REGEN_FENCE_PREFIX}${userId}`;
        const ownerToken = crypto.randomUUID();

        // SET NX + fencing-token increment must be one Redis-side atomic operation.
        // Otherwise a holder could expire between SET and INCR and mint a newer
        // fence after its successor already acquired the lease.
        const acquireScript = `
            if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[3]) then
                return redis.call('INCR', KEYS[2])
            end
            return 0
        `;
        const fenceToken = Number(await redis.eval(
            acquireScript,
            2,
            key,
            fenceKey,
            ownerToken,
            String(REGEN_LOCK_TTL_SECONDS)
        ));

        if (!fenceToken) return 'ALREADY_CLAIMED';
        return { ownerToken, fenceToken };
    } catch (error) {
        logger.error('MFA regen lock Redis error:', error);
        return 'STORAGE_ERROR';
    }
}

export async function releaseRegenLock(userId: string, ownerToken: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
        const key = `${REGEN_LOCK_PREFIX}${userId}`;
        // Compare-and-delete must be atomic: GET followed by DEL is unsafe because
        // a successor can acquire the expired lease between those two operations.
        const releaseScript = `
            if redis.call('GET', KEYS[1]) == ARGV[1] then
                return redis.call('DEL', KEYS[1])
            end
            return 0
        `;
        return Number(await redis.eval(releaseScript, 1, key, ownerToken)) === 1;
    } catch (error) {
        logger.error('MFA regen lock release Redis error:', error);
        return false;
    }
}

export async function resetMfaRedisState(): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    try {
        const keys = await redis.keys(`${KEY_PREFIX}*`);
        if (keys.length > 0) await redis.del(...keys);
    } catch (error) {
        logger.error('MFA Redis reset error:', error);
    }
}
