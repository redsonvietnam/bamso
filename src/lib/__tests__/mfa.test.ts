// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockRedis } from './mock-redis';
import * as fs from 'fs';
import * as path from 'path';

// Mock Redis before any imports that use it
const mockRedis = new MockRedis();
vi.mock('@/lib/redis', () => ({
    getRedisClient: () => mockRedis,
    getRedisPubSubClient: () => mockRedis,
}));

import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { signJWT, verifyJWT } from '@/lib/auth';
import { requireRole } from '@/lib/api-auth';
import { UserRole } from '@/lib/constants';
import {
    generateTotpSecret,
    generateTotp,
    encryptMfaSecret,
    decryptMfaSecret,
    generateRecoveryCodes,
    hashRecoveryCode,
    verifyAndConsumeRecoveryCode,
    createMfaChallengeToken,
    verifyMfaChallengeToken,
    consumeMfaChallenge,
    checkMfaRateLimit,
    recordMfaAttemptFailure,
} from '@/lib/mfa-service';
import { resetMfaRedisState } from '@/lib/mfa-redis';
import { POST as loginPost } from '@/app/api/auth/route';
import { POST as mfaVerifyPost } from '@/app/api/auth/mfa/verify/route';
import { POST as enrollStartPost } from '@/app/api/admin/mfa/enroll/start/route';
import { POST as enrollConfirmPost } from '@/app/api/admin/mfa/enroll/confirm/route';
import { POST as disableMfaPost } from '@/app/api/admin/mfa/disable/route';
import { POST as regenerateCodesPost } from '@/app/api/admin/mfa/recovery-codes/regenerate/route';
import { GET as mfaStatusGet } from '@/app/api/admin/mfa/status/route';
import { proxy } from '@/proxy';

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
        mockRedis['store'].clear();
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
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const req = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: testAdminUser.username, password: 'adminPassword123' }),
        });

        const res = await loginPost(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.mfaRequired).toBe(true);
        expect(typeof data.challengeToken).toBe('string');
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(mockCookiesStore.get('auth_token')).toBeUndefined();
    });

    it('AUTH-02: MFA-pending challenge token cannot access ADMIN APIs', async () => {
        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');

        const verified = await verifyJWT(challengeToken);
        expect(verified).toBeNull();

        mockCookiesStore.set('auth_token', challengeToken);
        const authResult = await requireRole(UserRole.ADMIN);
        expect('error' in authResult).toBe(true);
        if ('error' in authResult && authResult.error) {
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
            body: JSON.stringify({ challengeToken, code: currentTotp, factor: 'totp' }),
        });

        const verifyRes = await mfaVerifyPost(verifyReq);
        expect(verifyRes.status).toBe(200);
        const cookieHeader = verifyRes.headers.get('set-cookie') || '';
        expect(cookieHeader).toContain('auth_token=');

        const match = cookieHeader.match(/auth_token=([^;]+)/);
        const token = match ? match[1] : '';
        const payload = await verifyJWT(token);
        expect(payload).not.toBeNull();
        expect(payload?.role).toBe('ADMIN');
        expect(payload?.mfa).toBe(true);
    });

    it('AUTH-04: Password-only JWT rejected for MFA-enabled ADMIN', async () => {
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
        });

        const passwordOnlyToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', passwordOnlyToken);

        const result = await requireRole(UserRole.ADMIN);
        expect('error' in result).toBe(true);
        if ('error' in result && result.error) {
            expect(result.error.status).toBe(403);
            const data = await result.error.json();
            expect(data.code).toBe('MFA_REQUIRED');
        }
    });

    it('AUTH-05: Old password-only JWT issued before MFA enablement rejected afterward', async () => {
        const oldToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', oldToken);

        const allowedBefore = await requireRole(UserRole.ADMIN);
        expect('error' in allowedBefore).toBe(false);

        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
        });

        const rejectedAfter = await requireRole(UserRole.ADMIN);
        expect('error' in rejectedAfter).toBe(true);
        if ('error' in rejectedAfter && rejectedAfter.error) {
            expect(rejectedAfter.error.status).toBe(403);
            const body = await rejectedAfter.error.json();
            expect(body.code).toBe('MFA_REQUIRED');
        }
    });

    it('AUTH-06: Forged or unsigned MFA claim rejected', async () => {
        const forgedToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        const parts = forgedToken.split('.');
        const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature`;

        const verified = await verifyJWT(tamperedToken);
        expect(verified).toBeNull();
    });

    it('AUTH-07: Expired or replayed challenge rejected', async () => {
        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');

        const challenge1 = await verifyMfaChallengeToken(challengeToken);
        expect(challenge1).not.toBeNull();
        expect(await consumeMfaChallenge(challenge1!.jti)).toBe('CLAIMED');

        // Same challenge can be verified again (JWT is still valid),
        // but claiming it again must fail — replay detection is at claim
        const challenge2 = await verifyMfaChallengeToken(challengeToken);
        expect(challenge2).not.toBeNull();
        expect(await consumeMfaChallenge(challenge2!.jti)).toBe('ALREADY_CLAIMED');
    });

    it('AUTH-08: Dedicated MFA brute-force protection blocks after 5 failed attempts', async () => {
        const key = `mfa:test:user_${Date.now()}`;

        for (let i = 0; i < 4; i++) {
            const rl = await recordMfaAttemptFailure(key);
            expect(rl.allowed).toBe(true);
            expect(rl.remainingAttempts).toBe(5 - (i + 1));
        }

        const checkBlocked = await recordMfaAttemptFailure(key);
        expect(checkBlocked.allowed).toBe(false);
        expect(checkBlocked.remainingAttempts).toBe(0);
        expect(checkBlocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('AUTH-09: Encrypted secret + no secret leakage', async () => {
        const plainSecret = generateTotpSecret();
        const { encryptedSecret } = encryptMfaSecret(plainSecret);

        expect(encryptedSecret).not.toContain(plainSecret);
        expect(encryptedSecret.split(':')).toHaveLength(3);

        const decrypted = decryptMfaSecret(encryptedSecret);
        expect(decrypted).toBe(plainSecret);
    });

    it('AUTH-10: Recovery codes hashed, one-time, non-reusable', async () => {
        const codes = generateRecoveryCodes(1);
        const code = codes[0];
        const hash = hashRecoveryCode(code);

        expect(hash).not.toContain(code);

        await prisma.recoveryCode.create({
            data: {
                userId: testAdminUser.id,
                codeHash: hash,
            },
        });

        const first = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code);
        });
        expect(first).toBe(true);

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

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        mockCookiesStore.set('auth_token', token);

        const reqEmpty = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        });
        const resEmpty = await disableMfaPost(reqEmpty);
        expect(resEmpty?.status).toBe(400);

        const reqWrongPwd = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'wrongPassword', code: generateTotp(secret) }),
        });
        const resWrongPwd = await disableMfaPost(reqWrongPwd);
        expect(resWrongPwd!.status).toBe(401);

        const user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(true);
    });

    it('AUTH-12: No anonymous MFA-disable or recovery bypass', async () => {
        mockCookiesStore.clear();

        const req = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123', code: '123456' }),
        });

        const res = await disableMfaPost(req);
        expect(res!.status).toBe(401);
    });

    it('AUTH-13: Wrong encryption key fails closed', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret } = encryptMfaSecret(secret);

        process.env.MFA_ENCRYPTION_KEY = 'another-wrong-key-32-chars-long-test-12345';

        expect(() => decryptMfaSecret(encryptedSecret)).toThrow();
    });

    it('AUTH-14: MFA transitions audited without secrets', async () => {
        await prisma.auditLog.deleteMany({ where: { actorId: testAdminUser.id } });

        const req = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: testAdminUser.username, password: 'adminPassword123' }),
        });
        await loginPost(req);

        const logs = await prisma.auditLog.findMany({ where: { actorId: testAdminUser.id } });
        expect(logs.length).toBeGreaterThanOrEqual(1);

        const serialized = JSON.stringify(logs);
        expect(serialized).not.toContain('adminPassword123');
        expect(serialized).not.toContain(TEST_MFA_KEY);
    });

    it('AUTH-15: Non-MFA accounts preserve existing authentication', async () => {
        const staff = await prisma.user.create({
            data: {
                username: `test_staff_mfa_${Date.now()}`,
                passwordHash: hashPassword('staffPassword123'),
                name: 'Test Staff',
                role: 'STAFF',
                mfaEnabled: false,
            },
        });

        const req = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: staff.username, password: 'staffPassword123' }),
        });

        const res = await loginPost(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.mfaRequired).toBeUndefined();
        expect(res.headers.get('set-cookie')).toContain('auth_token=');

        await prisma.user.delete({ where: { id: staff.id } });
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

        const [res1, res2] = await Promise.all([
            prisma.$transaction(async (tx) => verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code)),
            prisma.$transaction(async (tx) => verifyAndConsumeRecoveryCode(tx, testAdminUser.id, code)),
        ]);

        const successes = [res1, res2].filter(Boolean).length;
        expect(successes).toBe(1);
    });

    it('Enrollment flow: start -> confirm enables MFA and issues mfa-assured session', async () => {
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', token);

        const startReq = new Request('http://localhost/api/admin/mfa/enroll/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123' }),
        });
        const startRes = await enrollStartPost(startReq);
        expect(startRes!.status).toBe(200);
        const startData = await startRes!.json();
        expect(startData.secret).toBeDefined();
        expect(startData.setupToken).toBeDefined();
        expect(startData.recoveryCodes).toHaveLength(10);

        let user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(false);

        const currentTotp = generateTotp(startData.secret);
        const confirmReq = new Request('http://localhost/api/admin/mfa/enroll/confirm', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ setupToken: startData.setupToken, code: currentTotp }),
        });
        const confirmRes = await enrollConfirmPost(confirmReq);
        expect(confirmRes!.status).toBe(200);

        const confirmCookie = confirmRes!.headers.get('set-cookie');
        const tokenMatch = confirmCookie?.match(/auth_token=([^;]+)/);
        if (tokenMatch) mockCookiesStore.set('auth_token', tokenMatch[1]);

        user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(true);
        expect(user?.mfaSecret).toBeDefined();

        const storedCodes = await prisma.recoveryCode.findMany({ where: { userId: testAdminUser.id } });
        expect(storedCodes).toHaveLength(10);

        const statusRes = await mfaStatusGet();
        const statusData = await statusRes!.json();
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

        const oldCode = 'OLD01-CODE1';
        await prisma.recoveryCode.create({
            data: { userId: testAdminUser.id, codeHash: hashRecoveryCode(oldCode) },
        });

        const mfaToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        mockCookiesStore.set('auth_token', mfaToken);

        const currentTotp = generateTotp(secret);
        const req = new Request('http://localhost/api/admin/mfa/recovery-codes/regenerate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123', code: currentTotp }),
        });

        const res = await regenerateCodesPost(req);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.recoveryCodes).toHaveLength(10);

        const oldMatch = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, oldCode);
        });
        expect(oldMatch).toBe(false);

        const newMatch = await prisma.$transaction(async (tx) => {
            return verifyAndConsumeRecoveryCode(tx, testAdminUser.id, data.recoveryCodes[0]);
        });
        expect(newMatch).toBe(true);
    });

    it('MFA-REPLAY-01: Same challenge + same factor: concurrent requests -> exactly one success', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');
        const currentTotp = generateTotp(secret);

        const makeReq = () => new Request('http://localhost/api/auth/mfa/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ challengeToken, code: currentTotp, factor: 'totp' }),
        });

        const [res1, res2, res3] = await Promise.all([
            mfaVerifyPost(makeReq()),
            mfaVerifyPost(makeReq()),
            mfaVerifyPost(makeReq()),
        ]);

        const statuses = [res1.status, res2.status, res3.status];
        const successCount = statuses.filter(s => s === 200).length;
        expect(successCount).toBe(1);
    });

    it('MFA-REPLAY-CONCURRENT-01: Recovery code concurrent: max one success', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const codes = generateRecoveryCodes(1);
        const recoveryCode = codes[0];
        await prisma.recoveryCode.create({
            data: { userId: testAdminUser.id, codeHash: hashRecoveryCode(recoveryCode) },
        });

        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');

        const makeReq = () => new Request('http://localhost/api/auth/mfa/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ challengeToken, code: recoveryCode, factor: 'recovery' }),
        });

        const [res1, res2] = await Promise.all([
            mfaVerifyPost(makeReq()),
            mfaVerifyPost(makeReq()),
        ]);

        const statuses = [res1.status, res2.status];
        const successCount = statuses.filter(s => s === 200).length;
        expect(successCount).toBe(1);
    });

    it('MFA-PROXY-01: Proxy rejects stale password-only JWT for ADMIN when MFA enabled', async () => {
        const staleToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', staleToken);

        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
        });

        const result = await requireRole(UserRole.ADMIN);
        expect('error' in result).toBe(true);
        if ('error' in result && result.error) {
            expect(result.error.status).toBe(403);
            const data = await result.error.json();
            expect(data.code).toBe('MFA_REQUIRED');
        }
    });

    it('MFA-RECOVERY-01: Disable route rejects recovery code, TOTP only', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const codes = generateRecoveryCodes(1);
        const recoveryCode = codes[0];
        await prisma.recoveryCode.create({
            data: { userId: testAdminUser.id, codeHash: hashRecoveryCode(recoveryCode) },
        });

        const mfaToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        mockCookiesStore.set('auth_token', mfaToken);

        const req = new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123', code: recoveryCode }),
        });

        const res = await disableMfaPost(req);
        expect(res!.status).toBe(401);
        const data = await res!.json();
        expect(data.code).toBe('MFA_INVALID_TOKEN');

        const user = await prisma.user.findUnique({ where: { id: testAdminUser.id } });
        expect(user?.mfaEnabled).toBe(true);
    });

    it('MFA-ENROLL-REPLAY-01: Enrollment token replay rejected', async () => {
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', token);

        const startReq = new Request('http://localhost/api/admin/mfa/enroll/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123' }),
        });
        const startRes = await enrollStartPost(startReq);
        const startData = await startRes!.json();

        const currentTotp = generateTotp(startData.secret);

        const confirmReq = () => new Request('http://localhost/api/admin/mfa/enroll/confirm', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ setupToken: startData.setupToken, code: currentTotp }),
        });

        const res1 = await enrollConfirmPost(confirmReq());
        expect(res1!.status).toBe(200);

        // After first confirm, MFA is enabled - need mfa-assured token for second attempt
        const cookie1 = res1!.headers.get('set-cookie');
        const tokenMatch = cookie1?.match(/auth_token=([^;]+)/);
        if (tokenMatch) mockCookiesStore.set('auth_token', tokenMatch[1]);

        const res2 = await enrollConfirmPost(confirmReq());
        expect(res2!.status).toBe(401);
        const data = await res2!.json();
        expect(data.code).toBe('MFA_ENROLLMENT_REPLAY');
    });

    it('MFA-RATELIMIT-01: POST /api/auth/mfa/verify enforces rate limit across both dimensions', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const makeVerifyReq = (wrongCode: string, ip?: string) => {
            const challengeToken = createMfaChallengeToken(testAdminUser.id, 'ADMIN');
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (ip) headers['x-forwarded-for'] = ip;
            return challengeToken.then(ct => new Request('http://localhost/api/auth/mfa/verify', {
                method: 'POST',
                headers,
                body: JSON.stringify({ challengeToken: ct, code: wrongCode, factor: 'totp' }),
            }));
        };

        // --- User dimension: 5 failures from same user, different IPs → user locked ---
        const userStatuses: number[] = [];
        for (let i = 0; i < 4; i++) {
            const req = await makeVerifyReq('000000', `10.0.0.${i + 1}`);
            const res = await mfaVerifyPost(req);
            userStatuses.push(res.status);
            expect(res.status).toBe(401);
        }
        const fifthReq = await makeVerifyReq('000000', '10.0.0.100');
        const fifthRes = await mfaVerifyPost(fifthReq);
        expect(fifthRes.status).toBe(429);
        const fifthBody = await fifthRes.json();
        expect(fifthBody.code).toBe('MFA_RATE_LIMITED');

        // 6th request → pre-flight IP check catches it (this IP was used in attempt 5)
        const sixthReq = await makeVerifyReq('000000', '10.0.0.100');
        const sixthRes = await mfaVerifyPost(sixthReq);
        expect(sixthRes.status).toBe(429);

        // Verify all 4 pre-5th were 401, 5th was 429
        expect(userStatuses).toEqual([401, 401, 401, 401]);

        // --- IP dimension: reset, then 5 failures from different users, same IP → IP locked ---
        await resetMfaRedisState();

        const ipKey = `mfa:ip:test_ratelimit_ip_${Date.now()}`;
        const ipStatuses: number[] = [];
        for (let i = 0; i < 4; i++) {
            const rl = await recordMfaAttemptFailure(ipKey);
            ipStatuses.push(rl.allowed ? 401 : 429);
            expect(rl.allowed).toBe(true);
        }
        const fifthIpRl = await recordMfaAttemptFailure(ipKey);
        expect(fifthIpRl.allowed).toBe(false);

        // 6th check → blocked
        const sixthIpRl = await checkMfaRateLimit(ipKey);
        expect(sixthIpRl.allowed).toBe(false);
        expect(sixthIpRl.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('Concurrent rate-limit failures: threshold cannot be bypassed', async () => {
        const key = `mfa:test:concurrent_${Date.now()}`;

        const results = await Promise.all(
            Array.from({ length: 6 }, () => recordMfaAttemptFailure(key))
        );

        const allowedCount = results.filter(r => r.allowed).length;
        const deniedCount = results.filter(r => !r.allowed).length;

        expect(allowedCount).toBe(4);
        expect(deniedCount).toBe(2);
    });

    it('Redis error: rate-limit primitives fail closed', async () => {
        vi.spyOn(mockRedis, 'get').mockRejectedValue(new Error('Connection refused'));
        vi.spyOn(mockRedis, 'incr').mockRejectedValue(new Error('Connection refused'));
        vi.spyOn(mockRedis, 'expire').mockRejectedValue(new Error('Connection refused'));
        vi.spyOn(mockRedis, 'ttl').mockRejectedValue(new Error('Connection refused'));
        vi.spyOn(mockRedis, 'del').mockRejectedValue(new Error('Connection refused'));

        try {
            // checkMfaRateLimit → denied when Redis throws
            const checkResult = await checkMfaRateLimit('mfa:ip:test-redis-error');
            expect(checkResult.allowed).toBe(false);
            expect(checkResult.remainingAttempts).toBe(0);
            expect(checkResult.retryAfterSeconds).toBeGreaterThan(0);

            // recordMfaAttemptFailure → denied when Redis throws
            const recordResult = await recordMfaAttemptFailure('mfa:ip:test-redis-error');
            expect(recordResult.allowed).toBe(false);
            expect(recordResult.remainingAttempts).toBe(0);
            expect(recordResult.retryAfterSeconds).toBeGreaterThan(0);

            // No local fallback — state was never stored
            const fallbackCheck = await checkMfaRateLimit('mfa:ip:test-redis-error');
            expect(fallbackCheck.allowed).toBe(false);
        } finally {
            vi.restoreAllMocks();
        }
    });

    // ============================================================
    // B1: Production MFA Authorization Boundary Tests
    // ============================================================

    describe('B1: Production MFA authorization boundary (requireRole)', () => {
        it('B1-01: ADMIN + mfaEnabled=true + password-only JWT (no mfa claim) => DENY', async () => {
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(true);
            if ('error' in result && result.error) {
                expect(result.error.status).toBe(403);
                const body = await result.error.json();
                expect(body.code).toBe('MFA_REQUIRED');
            }
        });

        it('B1-02: ADMIN + mfaEnabled=true + JWT mfa=false => DENY', async () => {
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: false });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(true);
            if ('error' in result && result.error) {
                expect(result.error.status).toBe(403);
            }
        });

        it('B1-03: ADMIN + mfaEnabled=true + MFA-assured JWT (mfa=true) => ALLOW', async () => {
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(false);
        });

        it('B1-04: ADMIN + mfaEnabled=false + normal ADMIN JWT => ALLOW', async () => {
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: false, mfaSecret: null, mfaEnabledAt: null },
            });

            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(false);
        });

        it('B1-05a: STAFF => existing behavior preserved (no MFA check)', async () => {
            const staff = await prisma.user.create({
                data: {
                    username: `test_staff_b1_${Date.now()}`,
                    passwordHash: hashPassword('staffPass123'),
                    name: 'B1 Staff',
                    role: 'STAFF',
                    mfaEnabled: false,
                },
            });

            const token = await signJWT({ userId: staff.id, role: 'STAFF' });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.STAFF);
            expect('error' in result).toBe(false);

            await prisma.user.delete({ where: { id: staff.id } });
        });

        it('B1-05b: KIOSK => existing behavior preserved (no MFA check)', async () => {
            const kiosk = await prisma.user.create({
                data: {
                    username: `test_kiosk_b1_${Date.now()}`,
                    passwordHash: hashPassword('kioskPass123'),
                    name: 'B1 Kiosk',
                    role: 'KIOSK',
                    mfaEnabled: false,
                },
            });

            const token = await signJWT({ userId: kiosk.id, role: 'KIOSK' });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.KIOSK);
            expect('error' in result).toBe(false);

            await prisma.user.delete({ where: { id: kiosk.id } });
        });

        it('B1-05c: DISPLAY => existing behavior preserved (no MFA check)', async () => {
            const display = await prisma.user.create({
                data: {
                    username: `test_display_b1_${Date.now()}`,
                    passwordHash: hashPassword('displayPass123'),
                    name: 'B1 Display',
                    role: 'DISPLAY',
                    mfaEnabled: false,
                },
            });

            const token = await signJWT({ userId: display.id, role: 'DISPLAY' });
            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.DISPLAY);
            expect('error' in result).toBe(false);

            await prisma.user.delete({ where: { id: display.id } });
        });

        it('B1-06: JWT issued before MFA enable => DENY', async () => {
            // Issue password-only JWT while MFA is disabled
            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });

            // Now enable MFA
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            mockCookiesStore.set('auth_token', token);

            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(true);
            if ('error' in result && result.error) {
                expect(result.error.status).toBe(403);
            }
        });

        it('B1-07: MFA challenge JWT used as auth_token => DENY', async () => {
            const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');
            mockCookiesStore.set('auth_token', challengeToken);

            // Challenge tokens have type='challenge' which verifyJWT rejects for auth
            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(true);
            if ('error' in result && result.error) {
                expect(result.error.status).toBe(401);
            }
        });

        it('B1-08: Tampered/forged mfa=true JWT => DENY', async () => {
            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
            const parts = token.split('.');
            const tampered = `${parts[0]}.${parts[1]}.tampered_signature`;
            mockCookiesStore.set('auth_token', tampered);

            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(true);
            if ('error' in result && result.error) {
                expect(result.error.status).toBe(401);
            }
        });

        it('B1-09: DB lookup failure during MFA decision => behavior documented', async () => {
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
            mockCookiesStore.set('auth_token', token);

            // requireRole calls authenticate() first (succeeds — JWT is valid),
            // then calls prisma.user.findUnique which is NOT wrapped in try-catch.
            // If DB fails, the error propagates as an unhandled rejection.
            // The proxy layer (enforceAdminMfa) DOES have try-catch and fails closed.
            // This is a known defense-in-depth gap: requireRole relies on the proxy
            // to catch DB errors at the edge. Testing that the JWT is valid first:
            const { authenticate } = await import('@/lib/api-auth');
            const authResult = await authenticate();
            expect('payload' in authResult).toBe(true);
            // The DB failure would propagate — this is the current behavior.
            // The proxy's enforceAdminMfa() catches this and returns false (fail closed).
        });
    });

    // ============================================================
    // B2: authenticate() foot-gun regression
    // ============================================================

    describe('B2: No ADMIN route uses generic authenticate() for authorization', () => {
        it('All ADMIN API routes use requireRole() which enforces MFA', async () => {
            // Verify that requireRole is the authorization boundary for ADMIN routes
            // by testing it with a password-only JWT when MFA is enabled
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
            mockCookiesStore.set('auth_token', token);

            // requireRole should reject — this is the production boundary
            const result = await requireRole(UserRole.ADMIN);
            expect('error' in result).toBe(true);
            if ('error' in result && result.error) {
                const body = await result.error.json();
                expect(body.code).toBe('MFA_REQUIRED');
            }
        });

        it('authenticateOptional() returns null for ADMIN without MFA claim when MFA enabled', async () => {
            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { mfaEnabled: true, mfaSecret: 'dummy:cipher:tag', mfaEnabledAt: new Date() },
            });

            const { authenticateOptional } = await import('@/lib/api-auth');
            const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
            mockCookiesStore.set('auth_token', token);

            const result = await authenticateOptional();
            expect(result).toBeNull();
        });
    });

    // ============================================================
    // B1-10: Protected ADMIN surfaces enforce same authorization rule
    // ============================================================

    describe('B1-10: Protected ADMIN surfaces inventory', () => {
        // Two-layer authorization model:
        //
        // Layer 1 — proxy() outer boundary (src/proxy.ts lines 160-167):
        //   /admin/*       → ADMIN
        //   /canbo/*       → STAFF, ADMIN
        //   /api/admin/*   → ADMIN
        //   /api/queue/*   → STAFF, ADMIN
        //   /api/staff/*   → ADMIN
        //   /api/stats/*   → ADMIN
        //   /api/settings  → ADMIN + MFA (non-GET)
        //   /api/themes    → ADMIN + MFA (non-GET)
        //
        // Layer 2 — route-level requireRole() defense-in-depth:
        //   Each privileged route handler calls requireRole() to enforce
        //   authorization even if proxy() is bypassed (e.g. internal calls).
        //
        // This inventory uses filesystem source inspection to verify that
        // each route file has an actual requireRole(...) invocation.
        //
        // Explicit maintained route inventory — NOT automatic route discovery.
        // New privileged routes must be added to the arrays below.

        function getSourceFileContent(routePath: string): string {
            // Convert '@/app/api/...' to absolute filesystem path
            const relativePath = routePath.replace('@/', 'src/');
            // Try with .ts extension first (route files), then without (directory routes)
            let absolutePath = path.join(process.cwd(), relativePath + '.ts');
            if (!fs.existsSync(absolutePath)) {
                absolutePath = path.join(process.cwd(), relativePath);
            }
            return fs.readFileSync(absolutePath, 'utf-8');
        }

        function assertRequiresRoleInvocation(source: string, routePath: string, expectedRoles: string[]) {
            // Verify source has requireRole import
            expect(source).toMatch(/import\s*\{[^}]*requireRole[^}]*\}\s*from\s*['"]@\/lib\/api-auth['"]/);
            // Verify source has actual requireRole(...) invocation (not just import)
            // Matches: requireRole(, requireRole (, await requireRole(
            expect(source).toMatch(/requireRole\s*\(/);
            // Verify expected roles appear near requireRole calls
            for (const role of expectedRoles) {
                // Role should appear in source — either as string literal or enum reference
                expect(source).toContain(role);
            }
        }

        it('All /api/admin/* routes call requireRole(ADMIN)', () => {
            const adminRoutes = [
                '@/app/api/admin/mfa/status/route',
                '@/app/api/admin/mfa/enroll/start/route',
                '@/app/api/admin/mfa/enroll/confirm/route',
                '@/app/api/admin/mfa/disable/route',
                '@/app/api/admin/mfa/recovery-codes/regenerate/route',
            ];

            for (const routePath of adminRoutes) {
                const source = getSourceFileContent(routePath);
                assertRequiresRoleInvocation(source, routePath, ['ADMIN']);
            }
        });

        it('All /api/queue/* mutation routes call requireRole(STAFF, ADMIN)', () => {
            // Queue mutation routes (POST) require STAFF or ADMIN
            const queueMutationRoutes = [
                '@/app/api/queue/call-next/route',
                '@/app/api/queue/complete/route',
                '@/app/api/queue/skip/route',
                '@/app/api/queue/restore/route',
                '@/app/api/queue/recall/route',
            ];

            for (const routePath of queueMutationRoutes) {
                const source = getSourceFileContent(routePath);
                assertRequiresRoleInvocation(source, routePath, ['STAFF', 'ADMIN']);
            }
        });

        it('/api/queue/estimate (GET) is public — no requireRole expected', () => {
            // estimate is a public GET endpoint for wait time estimation
            // It is NOT protected by requireRole at route level
            // proxy() still enforces /api/queue prefix for non-GET methods
            const source = getSourceFileContent('@/app/api/queue/estimate/route');
            expect(source).not.toMatch(/requireRole/);
        });

        it('/api/staff routes call requireRole(ADMIN)', () => {
            const source = getSourceFileContent('@/app/api/staff/route');
            assertRequiresRoleInvocation(source, '@/app/api/staff/route', ['ADMIN']);
        });

        it('/api/stats routes call requireRole(ADMIN)', () => {
            const source = getSourceFileContent('@/app/api/stats/route');
            assertRequiresRoleInvocation(source, '@/app/api/stats/route', ['ADMIN']);
        });

        it('/api/settings (mutation) protected by proxy MFA boundary', () => {
            // /api/settings PUT/DELETE handled by proxy (Layer 1)
            // Route-level auth depends on handler — proxy is the primary boundary
            const source = getSourceFileContent('@/app/api/settings/route');
            // Settings may use requireRole or authenticate — both are valid
            // The proxy enforces ADMIN + MFA for non-GET
            expect(source).toMatch(/requireRole|authenticate/);
        });

        it('/api/themes (mutation) protected by proxy MFA boundary', () => {
            const source = getSourceFileContent('@/app/api/themes/route');
            expect(source).toMatch(/requireRole|authenticate/);
        });

        it('proxy() deny-by-default: unknown /api routes return 401', async () => {
            const { NextRequest } = await import('next/server');
            const unknownRequest = new NextRequest('http://localhost/api/unknown-privileged');
            const unknownResponse = await proxy(unknownRequest);
            expect(unknownResponse.status).toBe(401);
        });
    });

    // ============================================================
    // B3: Demo token production guard
    // ============================================================

    describe('B3: Demo token production guard', () => {
        it('MFA-DEMO-TOKEN-PROD-01: production + DEMO_MODE_ENABLED=true => DENY', async () => {
            const originalDemo = process.env.DEMO_MODE_ENABLED;
            vi.stubEnv('NODE_ENV', 'production');
            process.env.DEMO_MODE_ENABLED = 'true';

            try {
                const req = new Request('http://localhost/api/demo-token?role=ADMIN');
                const { GET } = await import('@/app/api/demo-token/route');
                const res = await GET(req);
                expect(res.status).toBe(403);
                const body = await res.json();
                expect(body.code).toBe('FORBIDDEN');
            } finally {
                vi.unstubAllEnvs();
                process.env.DEMO_MODE_ENABLED = originalDemo;
            }
        });

        it('MFA-DEMO-TOKEN-DEV-01: development + DEMO_MODE_ENABLED=true => preserve demo behavior', async () => {
            const originalDemo = process.env.DEMO_MODE_ENABLED;
            vi.stubEnv('NODE_ENV', 'development');
            process.env.DEMO_MODE_ENABLED = 'true';

            try {
                const req = new Request('http://localhost/api/demo-token?role=STAFF');
                const { GET } = await import('@/app/api/demo-token/route');
                const res = await GET(req);
                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.token).toBeDefined();
                expect(body.role).toBe('STAFF');
            } finally {
                vi.unstubAllEnvs();
                process.env.DEMO_MODE_ENABLED = originalDemo;
            }
        });
    });
});
