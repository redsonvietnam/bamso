import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Prisma } from '@prisma/client';
import {
    claimChallengeJti,
    claimEnrollmentToken,
    recordMfaAttemptFailure as redisRecordFailure,
    recordMfaAttemptSuccess as redisRecordSuccess,
    checkMfaRateLimitState,
    type ClaimResult,
    type RateLimitResult,
} from '@/lib/mfa-redis';

export type { ClaimResult, RateLimitResult };

// --- Configuration ---
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_WINDOW_SECONDS = 30;
const CHALLENGE_EXPIRY_SECONDS = 300; // 5 minutes
const RECOVERY_SALT_PREFIX = 'BAMSO_RECOVERY_CODE_V1_';

// --- 1. Base32 Implementation (RFC 4648) ---

export function base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

export function base32Decode(input: string): Buffer {
    const cleaned = input.toUpperCase().replace(/[=\s-]/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < cleaned.length; i++) {
        const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
        if (idx === -1) {
            throw new Error(`Invalid base32 character: ${cleaned[i]}`);
        }
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

// --- 2. TOTP (RFC 6238 / RFC 4226) ---

export function generateTotpSecret(numBytes = 20): string {
    const randomBytes = crypto.randomBytes(numBytes);
    return base32Encode(randomBytes);
}

export function generateTotp(secret: string, timestamp: number = Date.now()): string {
    const key = base32Decode(secret);
    const counter = Math.floor(timestamp / 1000 / TOTP_WINDOW_SECONDS);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    const token = (binary % 1_000_000).toString().padStart(6, '0');
    return token;
}

export function verifyTotp(
    token: string,
    secret: string,
    options?: { window?: number; timestamp?: number }
): boolean {
    if (typeof token !== 'string') return false;
    const cleanToken = token.trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;

    const window = options?.window ?? 1;
    const now = options?.timestamp ?? Date.now();

    for (let step = -window; step <= window; step++) {
        const stepTime = now + step * TOTP_WINDOW_SECONDS * 1000;
        const expected = generateTotp(secret, stepTime);
        const a = Buffer.from(cleanToken);
        const b = Buffer.from(expected);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            return true;
        }
    }
    return false;
}

export function generateOtpAuthUri(options: {
    secret: string;
    username: string;
    issuer?: string;
}): string {
    const issuer = options.issuer || 'BAMSO';
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(options.username)}`;
    const params = new URLSearchParams({
        secret: options.secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30',
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

// --- 3. Encryption at Rest (AES-256-GCM) ---

export function getMfaEncryptionKey(): Buffer {
    const rawKey = process.env.MFA_ENCRYPTION_KEY;
    if (!rawKey || rawKey.trim() === '') {
        throw new Error('MFA_ENCRYPTION_KEY environment variable is required');
    }
    const trimmed = rawKey.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return Buffer.from(trimmed, 'hex');
    }
    if (trimmed.length < 32) {
        throw new Error('MFA_ENCRYPTION_KEY must be at least 32 characters');
    }
    return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

export function encryptMfaSecret(
    secret: string,
    keyVersion = process.env.MFA_KEY_VERSION || 'v1'
): { encryptedSecret: string; keyVersion: string } {
    const key = getMfaEncryptionKey();
    const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    const encryptedSecret = `${iv.toString('hex')}:${encrypted}:${tag}`;
    return { encryptedSecret, keyVersion };
}

export function decryptMfaSecret(encryptedSecret: string): string {
    const key = getMfaEncryptionKey();
    const parts = encryptedSecret.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted MFA secret payload format');
    }
    const [ivHex, cipherHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// --- 4. Recovery Codes ---

export function generateRecoveryCodes(count = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
        codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    }
    return codes;
}

export function normalizeRecoveryCode(code: string): string {
    return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
    const normalized = normalizeRecoveryCode(code);
    return crypto.createHash('sha256').update(`${RECOVERY_SALT_PREFIX}${normalized}`).digest('hex');
}

/**
 * Atomically verifies and consumes a recovery code inside a Prisma transaction.
 * Concurrency-safe: updateMany returns count === 0 if already consumed.
 */
export async function verifyAndConsumeRecoveryCode(
    tx: Prisma.TransactionClient,
    userId: string,
    code: string
): Promise<boolean> {
    const hash = hashRecoveryCode(code);

    const match = await tx.recoveryCode.findFirst({
        where: {
            userId,
            codeHash: hash,
            usedAt: null,
        },
    });

    if (!match) {
        return false;
    }

    const updated = await tx.recoveryCode.updateMany({
        where: {
            id: match.id,
            usedAt: null,
        },
        data: {
            usedAt: new Date(),
        },
    });

    return updated.count === 1;
}

// --- 5. MFA Challenge Token ---

function getJwtSecretBytes(): Buffer {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return Buffer.from(secret, 'utf8');
}

export async function createMfaChallengeToken(userId: string, role: string): Promise<string> {
    const jti = crypto.randomUUID();
    const secretBytes = getJwtSecretBytes();

    return new SignJWT({
        userId,
        role,
        type: 'mfa_challenge',
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(`${CHALLENGE_EXPIRY_SECONDS}s`)
        .sign(secretBytes);
}

export async function verifyMfaChallengeToken(
    token: string
): Promise<{ userId: string; role: string; jti: string } | null> {
    const secretBytes = getJwtSecretBytes();
    try {
        const { payload } = await jwtVerify(token, secretBytes, { algorithms: ['HS256'] });
        if (
            payload.type !== 'mfa_challenge' ||
            typeof payload.userId !== 'string' ||
            typeof payload.role !== 'string' ||
            typeof payload.jti !== 'string'
        ) {
            return null;
        }

        return {
            userId: payload.userId,
            role: payload.role,
            jti: payload.jti,
        };
    } catch {
        return null;
    }
}

/**
 * Atomically claim a challenge JTI.
 * Delegates to Redis — no process-local fallback.
 *
 * CLAIMED — caller wins
 * ALREADY_CLAIMED — replay detected
 * STORAGE_ERROR — Redis unavailable; fail closed
 */
export async function consumeMfaChallenge(jti: string): Promise<ClaimResult> {
    return claimChallengeJti(jti, CHALLENGE_EXPIRY_SECONDS);
}

// --- 5b. MFA Setup Token (Temporary State during Enrollment) ---

export async function createMfaSetupToken(data: {
    userId: string;
    secret: string;
    recoveryCodes: string[];
    jti?: string;
}): Promise<string> {
    const secretBytes = getJwtSecretBytes();
    return new SignJWT({
        userId: data.userId,
        secret: data.secret,
        recoveryCodes: data.recoveryCodes,
        type: 'mfa_enrollment',
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setJti(data.jti ?? crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(secretBytes);
}

export async function verifyMfaSetupToken(
    token: string
): Promise<{ userId: string; secret: string; recoveryCodes: string[]; jti: string } | null> {
    const secretBytes = getJwtSecretBytes();
    try {
        const { payload } = await jwtVerify(token, secretBytes, { algorithms: ['HS256'] });
        if (
            payload.type !== 'mfa_enrollment' ||
            typeof payload.userId !== 'string' ||
            typeof payload.secret !== 'string' ||
            !Array.isArray(payload.recoveryCodes) ||
            typeof payload.jti !== 'string'
        ) {
            return null;
        }
        return {
            userId: payload.userId,
            secret: payload.secret,
            recoveryCodes: payload.recoveryCodes as string[],
            jti: payload.jti,
        };
    } catch {
        return null;
    }
}

/**
 * Atomically claim an enrollment token.
 * Delegates to Redis — no process-local fallback.
 */
export async function consumeEnrollmentToken(jti: string): Promise<ClaimResult> {
    return claimEnrollmentToken(jti);
}

// --- 6. MFA Rate Limiting (Redis-backed, no local fallback) ---

/**
 * Check rate limit state WITHOUT mutating. Pre-flight gate.
 */
export async function checkMfaRateLimit(key: string): Promise<RateLimitResult> {
    return checkMfaRateLimitState(key);
}

/**
 * Record a failed MFA attempt. Single authoritative INCR.
 * Returns updated rate-limit state.
 */
export async function recordMfaAttemptFailure(key: string): Promise<RateLimitResult> {
    return redisRecordFailure(key);
}

/**
 * Record a successful MFA attempt. Resets the window.
 */
export async function recordMfaAttemptSuccess(key: string): Promise<void> {
    return redisRecordSuccess(key);
}

/**
 * Reset rate limits. No-op in production (Redis manages TTL).
 * Exists for test teardown only.
 */
export async function resetMfaRateLimits(): Promise<void> {
    // No process-local state to clear.
    // Tests should use resetMfaRedisState() from mfa-redis.ts.
}
