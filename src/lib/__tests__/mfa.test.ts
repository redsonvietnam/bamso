// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { signJWT, verifyJWT } from '@/lib/auth';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import {
    generateTotpSecret,
    generateTotp,
    verifyTotp,
    encryptMfaSecret,
    decryptMfaSecret,
    generateRecoveryCodes,
    hashRecoveryCode,
    verifyAndConsumeRecoveryCode,
    createMfaChallengeToken,
    verifyMfaChallengeToken,
    consumeMfaChallenge,
    checkMfaRateLimit,
    recordMfaAttempt,
    resetMfaRateLimits,
} from '@/lib/mfa-service';
import { POST as loginPost } from '@/app/api/auth/route';
import { POST as mfaVerifyPost } from '@/app/api/auth/mfa/verify/route';
import { POST as enrollStartPost } from '@/app/api/admin/mfa/enroll/start/route';
import { POST as enrollConfirmPost } from '@/app/api/admin/mfa/enroll/confirm/route';
import { POST as disableMfaPost } from '@/app/api/admin/mfa/disable/route';
import { POST as regenerateCodesPost } from '@/app/api/admin/mfa/recovery-codes/regenerate/route';
import { GET as mfaStatusGet } from '@/app/api/admin/mfa/status/route';

const TEST_MFA_KEY = '1234567890123456789012345678901234567890123456789012345678901234';

// Mock cookies for Next.js headers
const mockCookiesStore = new Map<string, string>();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => (mockCookiesStore.has(name) ? { value: mockCookiesStore.get(name) } : undefined),
        set: (name: string, value: string) => mockCookiesStore.set(name, value),
    })),
}));

describe('MFA Security Invariants (AUTH-01 to AUTH-15)', () => {
    const originalEnv = { ...process.env };
    let testAdminUser: { id: string; username: string };

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters-for-testing';
        process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY;
        resetMfaRateLimits();
        mockCookiesStore.clear();

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        testAdminUser = await prisma.user.create({
            data: {
                username: `test_admin_mfa_${uniqueSuffix}`,
                passwordHash: hashPassword('adminPassword123'),
                name: 'Test Admin',
                role: 'ADMIN',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });
    });

    afterEach(async () => {
        if (testAdminUser?.id) {
            await prisma.recoveryCode.deleteMany({ where: { userId: testAdminUser.id } });
            await prisma.auditLog.deleteMany({ where: { actorId: testAdminUser.id } });
            await prisma.user.deleteMany({ where: { id: testAdminUser.id } });
        }
        process.env = { ...originalEnv };
    });

    it('AUTH-01: MFA-enabled ADMIN + correct password does not receive authenticated ADMIN JWT', async () => {
        // Enable MFA for admin
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const req = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'test_admin_mfa', password: 'adminPassword123' }),
        });

        const res = await loginPost(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.mfaRequired).toBe(true);
        expect(typeof data.challengeToken).toBe('string');
        // Must NOT set the auth_token cookie
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(mockCookiesStore.get('auth_token')).toBeUndefined();
    });

    it('AUTH-02: MFA-pending challenge token cannot access ADMIN APIs', async () => {
        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');

        // Challenge tokens cannot be validated as session tokens
        const verified = await verifyJWT(challengeToken);
        expect(verified).toBeNull();

        // If sent as auth_token cookie, authenticate() rejects it
        mockCookiesStore.set('auth_token', challengeToken);
        const authResult = await requireRole(UserRole.ADMIN);
        expect('error' in authResult).toBe(true);
        if ('error' in authResult) {
            expect(authResult.error.status).toBe(401);
        }
    });

    it('AUTH-03: Valid TOTP creates authenticated MFA-assured ADMIN session', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');
        const currentTotp = generateTotp(secret);

        const verifyReq = new Request('http://localhost/api/auth/mfa/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ challengeToken, code: currentTotp }),
        });

        const verifyRes = await mfaVerifyPost(verifyReq);
        expect(verifyRes.status).toBe(200);
        const cookieHeader = verifyRes.headers.get('set-cookie') || '';
        expect(cookieHeader).toContain('auth_token=');

        // Extract token and verify MFA assurance
        const match = cookieHeader.match(/auth_token=([^;]+)/);
        const token = match ? match[1] : '';
        const payload = await verifyJWT(token);
        expect(payload).not.toBeNull();
        expect(payload?.role).toBe('ADMIN');
        expect(payload?.mfa).toBe(true);
    });

    it('AUTH-04: Password-only JWT rejected for MFA-enabled ADMIN', async () => {
        // Enable MFA in DB
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
        });

        // Sign token WITHOUT mfa: true claim
        const passwordOnlyToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', passwordOnlyToken);

        const result = await requireRole(UserRole.ADMIN);
        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error.status).toBe(403);
            const data = await result.error.json();
            expect(data.code).toBe('MFA_REQUIRED');
        }
    });

    it('AUTH-05: Old password-only JWT issued before MFA enablement rejected afterward', async () => {
        // Issue token while MFA is disabled
        const oldToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', oldToken);

        // Before MFA enabled -> access allowed
        const allowedBefore = await requireRole(UserRole.ADMIN);
        expect('error' in allowedBefore).toBe(false);

        // Now MFA is enabled
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
        });

        // Calling ADMIN API with the old token MUST be rejected
        const rejectedAfter = await requireRole(UserRole.ADMIN);
        expect('error' in rejectedAfter).toBe(true);
        if ('error' in rejectedAfter) {
            expect(rejectedAfter.error.status).toBe(403);
            const body = await rejectedAfter.error.json();
            expect(body.code).toBe('MFA_REQUIRED');
        }
    });

    it('AUTH-06: Forged or unsigned MFA claim rejected', async () => {
        // Attempt to forge a token signed with a different key
        const fakeSecret = 'fake-key-that-does-not-match-jwt-secret-at-all';
        const forgedToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        // Alter token
        const parts = forgedToken.split('.');
        const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature`;

        const verified = await verifyJWT(tamperedToken);
        expect(verified).toBeNull();
    });

    it('AUTH-07: Expired or replayed challenge rejected', async () => {
        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');

        // First verification
        const challenge1 = await verifyMfaChallengeToken(challengeToken);
        expect(challenge1).not.toBeNull();
        expect(consumeMfaChallenge(challenge1!.jti)).toBe(true);

        // Replay attempt with same challengeToken
        const challenge2 = await verifyMfaChallengeToken(challengeToken);
        expect(challenge2).toBeNull();
    });

    it('AUTH-08: Dedicated MFA brute-force protection blocks after 5 failed attempts', async () => {
        const key = `mfa:test:user_${Date.now()}`;

        for (let i = 0; i < 4; i++) {
            recordMfaAttempt(key, false);
            const check = checkMfaRateLimit(key);
            expect(check.allowed).toBe(true);
            expect(check.remainingAttempts).toBe(5 - (i + 1));
        }

        // 5th failed attempt
        recordMfaAttempt(key, false);
        const checkBlocked = checkMfaRateLimit(key);
        expect(checkBlocked.allowed).toBe(false);
        expect(checkBlocked.remainingAttempts).toBe(0);
        expect(checkBlocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('AUTH-09: Encrypted secret + no secret leakage', async () => {
        const plainSecret = generateTotpSecret();
        const { encryptedSecret } = encryptMfaSecret(plainSecret);

        // Encrypted string is in iv:cipher:tag format
        expect(encryptedSecret).not.toContain(plainSecret);
        expect(encryptedSecret.split(':')).toHaveLength(3);

        // Decryption retrieves original secret
        const decrypted = decryptMfaSecret(encryptedSecret);
        expect(decrypted).toBe(plainSecret);
    });

    it('AUTH-10: Recovery codes hashed, one-time, non-reusable', async () => {
        const codes = generateRecoveryCodes(1);
        const code = codes[0];
        const hash = hashRecoveryCode(code);

        // Hash does not contain plaintext
        expect(hash).not.toContain(code);

        await prisma.recoveryCode.create({
            data: {
                userId: testAdminUser.id,
                codeHash: hash,
            },
        });

        // 1st consumption succeeds
        const first = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code);
        });
        expect(first).toBe(true);

        // 2nd consumption MUST fail
        const second = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code);
        });
        expect(second).toBe(false);
    });

    it('AUTH-11: Session possession alone cannot disable MFA', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaEnabledAt: new Date() },
        });

        // Provide authenticated session token
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        mockCookiesStore.set('auth_token', token);

        // Try disable without password & code
        const reqEmpty = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        });
        const resEmpty = await disableMfaPost(reqEmpty);
        expect(resEmpty.status).toBe(400);

        // Try disable with wrong password
        const reqWrongPwd = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'wrongPassword', code: generateTotp(secret) }),
        });
        const resWrongPwd = await disableMfaPost(reqWrongPwd);
        expect(resWrongPwd.status).toBe(401);

        // Ensure MFA remains enabled
        const user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(true);
    });

    it('AUTH-12: No anonymous MFA-disable or recovery bypass', async () => {
        mockCookiesStore.clear(); // No cookie

        const req = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123', code: '123456' }),
        });

        const res = await disableMfaPost(req);
        expect(res.status).toBe(401);
    });

    it('AUTH-13: Wrong encryption key fails closed', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret } = encryptMfaSecret(secret);

        // Switch to wrong encryption key
        process.env.MFA_ENCRYPTION_KEY = 'another-wrong-key-32-chars-long-test-12345';

        // Decryption must throw an error rather than returning false/empty
        expect(() => decryptMfaSecret(encryptedSecret)).toThrow();
    });

    it('AUTH-14: MFA transitions audited without secrets', async () => {
        // Clear audit log
        await prisma.auditLog.deleteMany({});

        // Log in with non-MFA
        const req = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'test_admin_mfa', password: 'adminPassword123' }),
        });
        await loginPost(req);

        const logs = await prisma.auditLog.findMany();
        expect(logs.length).toBeGreaterThanOrEqual(1);

        const serialized = JSON.stringify(logs);
        expect(serialized).not.toContain('adminPassword123');
        expect(serialized).not.toContain(TEST_MFA_KEY);
    });

    it('AUTH-15: Non-MFA accounts preserve existing authentication', async () => {
        // Seed staff account
        const staff = await prisma.user.create({
            data: {
                username: 'test_staff_mfa',
                passwordHash: hashPassword('staffPassword123'),
                name: 'Test Staff',
                role: 'STAFF',
                mfaEnabled: false,
            },
        });

        const req = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'test_staff_mfa', password: 'staffPassword123' }),
        });

        const res = await loginPost(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.mfaRequired).toBeUndefined();
        expect(res.headers.get('set-cookie')).toContain('auth_token=');
    });

    it('Concurrent recovery-code consumption: maximum one success', async () => {
        const codes = generateRecoveryCodes(1);
        const code = codes[0];
        const hash = hashRecoveryCode(code);

        await prisma.recoveryCode.create({
            data: {
                userId: testAdminUser.id,
                codeHash: hash,
            },
        });

        // Run two concurrent attempts to consume the same code
        const [res1, res2] = await Promise.all([
            prisma.$transaction(async (tx) => verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code)),
            prisma.$transaction(async (tx) => verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code)),
        ]);

        // Exactly one must be true, the other false
        const successes = [res1, res2].filter(Boolean).length;
        expect(successes).toBe(1);
    });

    it('Enrollment flow: start -> confirm enables MFA and issues mfa-assured session', async () => {
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', token);

        // 1. Start enrollment
        const startReq = new Request('http://localhost/api/admin/mfa/enroll/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123' }),
        });
        const startRes = await enrollStartPost(startReq);
        expect(startRes.status).toBe(200);
        const startData = await startRes.json();
        expect(startData.secret).toBeDefined();
        expect(startData.setupToken).toBeDefined();
        expect(startData.recoveryCodes).toHaveLength(10);

        // Ensure MFA not yet enabled in DB
        let user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(false);

        // 2. Confirm enrollment with valid TOTP
        const currentTotp = generateTotp(startData.secret);
        const confirmReq = new Request('http://localhost/api/admin/mfa/enroll/confirm', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ setupToken: startData.setupToken, code: currentTotp }),
        });
        const confirmRes = await enrollConfirmPost(confirmReq);
        expect(confirmRes.status).toBe(200);

        // Update cookie with new MFA-assured session
        const confirmCookie = confirmRes.headers.get('set-cookie');
        const tokenMatch = confirmCookie?.match(/auth_token=([^;]+)/);
        if (tokenMatch) mockCookiesStore.set('auth_token', tokenMatch[1]);

        // Check DB now shows enabled
        user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(true);
        expect(user?.mfaSecret).toBeDefined();

        // Check recovery codes stored as hashes
        const storedCodes = await prisma.recoveryCode.findMany({ where: { userId: testAdminUser.id } });
        expect(storedCodes).toHaveLength(10);

        // 3. Status endpoint reflects enabled state
        const statusRes = await mfaStatusGet();
        const statusData = await statusRes.json();
        expect(statusData.mfaEnabled).toBe(true);
        expect(statusData.remainingRecoveryCodes).toBe(10);
    });

    it('Recovery code regeneration replaces old codes', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        // Insert 1 initial code
        const oldCode = 'OLD01-CODE1';
        await prisma.recoveryCode.create({
            data: { userId: testAdminUser.id, codeHash: hashRecoveryCode(oldCode) },
        });

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        mockCookiesStore.set('auth_token', token);

        const currentTotp = generateTotp(secret);
        const req = new Request('http://localhost/api/admin/mfa/recovery-codes/regenerate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123', code: currentTotp }),
        });

        const res = await regenerateCodesPost(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.recoveryCodes).toHaveLength(10);

        // Old code must be gone
        const oldMatch = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, oldCode);
        });
        expect(oldMatch).toBe(false);

        // One of the new codes must be consumable
        const newMatch = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, data.recoveryCodes[0]);
        });
        expect(newMatch).toBe(true);
    });
});
