// @vitest-environment node

import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { signJWT, verifyJWT } from '@/lib/auth';

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn() },
}));

describe('JWT claim validation', () => {
    it('accepts a valid userId and known role', async () => {
        process.env.JWT_SECRET = 'test-secret-for-auth-security-1234567890';
        const token = await signJWT({ userId: 'user-1', role: 'STAFF' });

        await expect(verifyJWT(token)).resolves.toEqual({ userId: 'user-1', role: 'STAFF' });
    });

    it.each([
        ['missing userId', { role: 'STAFF' }],
        ['empty userId', { userId: '', role: 'STAFF' }],
        ['non-string userId', { userId: 123, role: 'STAFF' }],
        ['missing role', { userId: 'user-1' }],
        ['unknown role', { userId: 'user-1', role: 'SUPERADMIN' }],
        ['non-string role', { userId: 'user-1', role: 123 }],
    ])('rejects signed token with %s', async (_label, payload) => {
        process.env.JWT_SECRET = 'test-secret-for-auth-security-1234567890';
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('24h')
            .sign(Buffer.from(process.env.JWT_SECRET, 'utf8'));

        await expect(verifyJWT(token)).resolves.toBeNull();
    });
});
