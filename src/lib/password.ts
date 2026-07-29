import crypto from 'crypto';

const DEFAULT_ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DIGEST = 'sha512';

/**
 * Hashes a password using PBKDF2 with a random salt.
 * Format: "iterations:salt:hash" (new) or "salt:hash" (legacy 1000 iterations).
 */
export function hashPassword(password: string, iterations: number = DEFAULT_ITERATIONS): string {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
    return `${iterations}:${salt}:${hash}`;
}

/**
 * Verifies a plain text password against a stored hash.
 * Supports both new format (iterations:salt:hash) and legacy format (salt:hash).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');

    let iterations: number;
    let salt: string;
    let originalHash: string;

    if (parts.length === 3) {
        // New format: iterations:salt:hash
        iterations = parseInt(parts[0], 10);
        salt = parts[1];
        originalHash = parts[2];
    } else if (parts.length === 2) {
        // Legacy format: salt:hash (1000 iterations)
        iterations = 1000;
        salt = parts[0];
        originalHash = parts[1];
    } else {
        return false;
    }

    if (!salt || !originalHash || isNaN(iterations)) {
        return false;
    }

    const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');

    // Use timingSafeEqual to prevent timing attacks
    try {
        const hashBuf = Buffer.from(hash, 'hex');
        const origBuf = Buffer.from(originalHash, 'hex');
        if (hashBuf.length !== origBuf.length) return false;
        return crypto.timingSafeEqual(hashBuf, origBuf);
    } catch {
        return false;
    }
}

/**
 * Checks if a stored hash needs to be rehashed with more iterations.
 * Returns true if the hash was created with fewer than DEFAULT_ITERATIONS.
 */
export function needsRehash(storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length === 3) {
        const iterations = parseInt(parts[0], 10);
        return iterations < DEFAULT_ITERATIONS;
    }
    // Legacy format (no iteration count) always needs rehash
    return parts.length === 2;
}
