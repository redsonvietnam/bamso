import crypto from 'crypto';

const HASH_ITERATIONS = 1000;
const KEY_LENGTH = 64; // bytes
const SALT_LENGTH = 16; // bytes
const DIGEST = 'sha512';

/**
 * Hashes a password using PBKDF2 with a random salt.
 * @param password The plain text password.
 * @returns A string in the format "salt:hashed_hex".
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verifies a plain text password against a stored hashed password.
 * @param password The plain text password to verify.
 * @param storedHash The stored hash string (salt:hashed_hex).
 * @returns True if the password matches, false otherwise.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) {
        return false;
    }
    const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return hash === originalHash;
}
