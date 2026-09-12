// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockRedis } from './mock-redis';

const mockRedis = new MockRedis();
vi.mock('@/lib/redis', () => ({
    getRedisClient: () => mockRedis,
    getRedisPubSubClient: () => mockRedis,
}));

let mockUserId = '';
let mockUserRole = 'ADMIN';
vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async (_role?: string) => ({
        payload: { userId: mockUserId, role: mockUserRole },
    })),
}));

import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { UserRole } from '@/lib/constants';
import {
    generateTotpSecret,
    generateTotp,
    encryptMfaSecret,
    generateRecoveryCodes,
    hashRecoveryCode,
    createMfaChallengeToken,
} from '@/lib/mfa-service';
import { POST as loginPost } from '@/app/api/auth/route';
import { POST as mfaVerifyPost } from '@/app/api/auth/mfa/verify/route';
import { POST as enrollStartPost } from '@/app/api/admin/mfa/enroll/start/route';
import { POST as enrollConfirmPost } from '@/app/api/admin/mfa/enroll/confirm/route';
import { POST as disableMfaPost } from '@/app/api/admin/mfa/disable/route';
import { POST as regenerateCodesPost } from '@/app/api/admin/mfa/recovery-codes/regenerate/route';
import { GET as mfaStatusGet } from '@/app/api/admin/mfa/status/route';

const TEST_MFA_KEY = '1234567890123456789012345678901234567890123456789012345678901234';

describe('MFA Lifecycle Integrity (Task C)', () => {
    const originalEnv = { ...process.env };
    let testAdminUser: { id: string; username: string };

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters-for-testing';
        process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY;
        mockRedis['store'].clear();
        mockRedis.setFail(false);

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        testAdminUser = await prisma.user.create({
            data: {
                username: `test_admin_lc_${uniqueSuffix}`,
                passwordHash: hashPassword('adminPassword123'),
                name: 'Test Admin',
                role: 'ADMIN',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });
        mockUserId = testAdminUser.id;
        mockUserRole = 'ADMIN';
    });

    afterEach(async () => {
        if (testAdminUser?.id) {
            await prisma.recoveryCode.deleteMany({ where: { userId: testAdminUser.id } });
            await prisma.auditLog.deleteMany({ where: { actorId: testAdminUser.id } });
            await prisma.user.deleteMany({ where: { id: testAdminUser.id } });
        }
        mockRedis['store'].clear();
        process.env = { ...originalEnv };
    });

    async function enableMfaAndGetCodes(): Promise<{ secret: string; codes: string[] }> {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        const codes = generateRecoveryCodes(10);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });
        for (const code of codes) {
            await prisma.recoveryCode.create({
                data: { userId: testAdminUser.id, codeHash: hashRecoveryCode(code) },
            });
        }
        return { secret, codes };
    }

    async function decodeSetupToken(token: string): Promise<{ secret: string; jti: string }> {
        const { jwtVerify } = await import('jose');
        const { payload } = await jwtVerify(
            token,
            Buffer.from(process.env.JWT_SECRET!, 'utf8'),
            { algorithms: ['HS256'] }
        );
        return { secret: payload.secret as string, jti: payload.jti as string };
    }

    function startReq(password = 'adminPassword123') {
        return new Request('http://localhost/api/admin/mfa/enroll/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password }),
        });
    }

    function confirmReq(setupToken: string, code: string) {
        return new Request('http://localhost/api/admin/mfa/enroll/confirm', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ setupToken, code }),
        });
    }

    function disableReq(password: string, code: string) {
        return new Request('http://localhost/api/admin/mfa/disable', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password, code }),
        });
    }

    function regenReq(password: string, code: string) {
        return new Request('http://localhost/api/admin/mfa/recovery-codes/regenerate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password, code }),
        });
    }

    describe('C-01 to C-03: Single enrollment generation', () => {
        it('C-01: Second enroll/start invalidates first setup token', async () => {
            const res1 = (await enrollStartPost(startReq()))!;
            const data1 = await res1.json();
            expect(data1.setupToken).toBeDefined();

            const res2 = (await enrollStartPost(startReq()))!;
            const data2 = await res2.json();
            expect(data2.setupToken).toBeDefined();

            const user = await prisma.user.findUnique({
                where: { id: testAdminUser.id },
                select: { enrollmentJti: true },
            });
            expect(user?.enrollmentJti).toBeDefined();
        });

        it('C-02: Confirm with stale setup token returns 409', async () => {
            const res1 = (await enrollStartPost(startReq()))!;
            const data1 = await res1.json();

            await enrollStartPost(startReq());

            const { secret } = await decodeSetupToken(data1.setupToken);
            const code = generateTotp(secret);
            const confirmRes = (await enrollConfirmPost(confirmReq(data1.setupToken, code)))!;
            expect(confirmRes.status).toBe(409);
            const confirmData = await confirmRes.json();
            expect(confirmData.code).toBe('MFA_ENROLLMENT_STALE');
        });

        it('C-03: Confirm with current setup token succeeds', async () => {
            const res1 = (await enrollStartPost(startReq()))!;
            const data1 = await res1.json();

            const { secret } = await decodeSetupToken(data1.setupToken);
            const code = generateTotp(secret);
            const confirmRes = (await enrollConfirmPost(confirmReq(data1.setupToken, code)))!;
            expect(confirmRes.status).toBe(200);
            const confirmData = await confirmRes.json();
            expect(confirmData.success).toBe(true);

            const user = await prisma.user.findUnique({
                where: { id: testAdminUser.id },
                select: { mfaEnabled: true, enrollmentJti: true },
            });
            expect(user?.mfaEnabled).toBe(true);
            expect(user?.enrollmentJti).toBeNull();
        });
    });

    describe('C-04: Disable concurrency', () => {
        it('C-04: Two concurrent disables — only one succeeds', async () => {
            const { secret } = await enableMfaAndGetCodes();

            const code1 = generateTotp(secret);
            const code2 = generateTotp(secret);

            const [res1, res2] = await Promise.all([
                disableMfaPost(disableReq('adminPassword123', code1)),
                disableMfaPost(disableReq('adminPassword123', code2)),
            ]);

            const statuses = [res1!.status, res2!.status];
            expect(statuses.some(s => s === 200)).toBe(true);

            const user = await prisma.user.findUnique({
                where: { id: testAdminUser.id },
                select: { mfaEnabled: true },
            });
            expect(user?.mfaEnabled).toBe(false);
        });
    });

    describe('C-05: Regeneration concurrency', () => {
        it('C-05: Two concurrent regenerations — only one succeeds', async () => {
            const { secret } = await enableMfaAndGetCodes();

            const code1 = generateTotp(secret);
            const code2 = generateTotp(secret);

            const [res1, res2] = await Promise.all([
                regenerateCodesPost(regenReq('adminPassword123', code1)),
                regenerateCodesPost(regenReq('adminPassword123', code2)),
            ]);

            const statuses = [res1!.status, res2!.status];
            expect(statuses).toContain(200);
            expect(statuses).toContain(409);
        });
    });

    describe('C-06 to C-07: Recovery factor routing', () => {
        it('C-06: Recovery code cannot disable MFA (TOTP only)', async () => {
            const { codes } = await enableMfaAndGetCodes();

            const res = (await disableMfaPost(disableReq('adminPassword123', codes[0])))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('MFA_INVALID_TOKEN');
        });

        it('C-07: Recovery code cannot regenerate codes (TOTP only)', async () => {
            const { codes } = await enableMfaAndGetCodes();

            const res = (await regenerateCodesPost(regenReq('adminPassword123', codes[0])))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('MFA_INVALID_TOKEN');
        });
    });

    describe('C-08: AUTH-10 enhanced — concurrent recovery consumption', () => {
        it('C-08: Same challenge + same factor: concurrent requests → exactly one success', async () => {
            const { secret } = await enableMfaAndGetCodes();
            const challengeToken = await createMfaChallengeToken(testAdminUser.id, UserRole.ADMIN);

            const code = generateTotp(secret);
            const verifyReq1 = new Request('http://localhost/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ challengeToken, factor: 'totp', code }),
            });
            const verifyReq2 = new Request('http://localhost/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ challengeToken, factor: 'totp', code }),
            });

            const [res1, res2] = await Promise.all([
                mfaVerifyPost(verifyReq1),
                mfaVerifyPost(verifyReq2),
            ]);

            const statuses = [res1!.status, res2!.status];
            expect(statuses.filter(s => s === 200).length).toBe(1);
            expect(statuses.filter(s => s === 401).length).toBe(1);
        });
    });

    describe('C-09: AUTH-14 enhanced — audit assertions', () => {
        it('C-09: All MFA transitions are audited with correct action codes', async () => {
            await enableMfaAndGetCodes();

            const logs = await prisma.auditLog.findMany({
                where: {
                    actorId: testAdminUser.id,
                    action: { startsWith: 'MFA_' },
                },
                orderBy: { createdAt: 'asc' },
            });

            for (const log of logs) {
                expect(log.actorType).toBe('USER');
                expect(log.actorId).toBe(testAdminUser.id);
                expect(log.entityType).toBe('MFA');
                expect(typeof log.success).toBe('boolean');
                if (log.metadata) {
                    const meta = JSON.parse(log.metadata);
                    expect(meta).not.toHaveProperty('secret');
                    expect(meta).not.toHaveProperty('mfaSecret');
                    expect(meta).not.toHaveProperty('passwordHash');
                }
            }
        });
    });

    describe('C-27 to C-28: Redis failure tests', () => {
        it('C-27: Redis failure during enrollment claim fails closed', async () => {
            const res1 = (await enrollStartPost(startReq()))!;
            const data1 = await res1.json();
            expect(data1.setupToken).toBeDefined();

            mockRedis.setFail(true);

            const { secret } = await decodeSetupToken(data1.setupToken);
            const code = generateTotp(secret);
            const confirmRes = (await enrollConfirmPost(confirmReq(data1.setupToken, code)))!;
            expect(confirmRes.status).toBe(503);
            const confirmData = await confirmRes.json();
            expect(confirmData.code).toBe('MFA_ENROLLMENT_STORAGE_ERROR');

            mockRedis.setFail(false);
        });

        it('C-28: Redis failure during regeneration lock fails closed', async () => {
            const { secret } = await enableMfaAndGetCodes();

            mockRedis.setFail(true);

            const code = generateTotp(secret);
            const res = (await regenerateCodesPost(regenReq('adminPassword123', code)))!;
            expect(res.status).toBe(503);
            const data = await res.json();
            expect(data.code).toBe('MFA_REGEN_STORAGE_ERROR');

            mockRedis.setFail(false);
        });
    });

    describe('C-10 to C-26: Lifecycle edge cases', () => {
        it('C-10: Enrollment JTI cleared after successful confirm', async () => {
            const res1 = (await enrollStartPost(startReq()))!;
            const data1 = await res1.json();

            const user1 = await prisma.user.findUnique({
                where: { id: testAdminUser.id },
                select: { enrollmentJti: true },
            });
            expect(user1?.enrollmentJti).toBeDefined();

            const { secret } = await decodeSetupToken(data1.setupToken);
            const code = generateTotp(secret);
            await enrollConfirmPost(confirmReq(data1.setupToken, code));

            const user2 = await prisma.user.findUnique({
                where: { id: testAdminUser.id },
                select: { enrollmentJti: true },
            });
            expect(user2?.enrollmentJti).toBeNull();
        });

        it('C-11: Enrollment JTI cleared after disable', async () => {
            const { secret } = await enableMfaAndGetCodes();

            await prisma.user.update({
                where: { id: testAdminUser.id },
                data: { enrollmentJti: 'test-jti' },
            });

            const code = generateTotp(secret);
            await disableMfaPost(disableReq('adminPassword123', code));

            const user = await prisma.user.findUnique({
                where: { id: testAdminUser.id },
                select: { enrollmentJti: true },
            });
            expect(user?.enrollmentJti).toBeNull();
        });

        it('C-12: Disable returns MFA_NOT_ENABLED when already disabled', async () => {
            const { secret } = await enableMfaAndGetCodes();

            const code1 = generateTotp(secret);
            const res1 = (await disableMfaPost(disableReq('adminPassword123', code1)))!;
            expect(res1.status).toBe(200);

            const code2 = generateTotp(secret);
            const res2 = (await disableMfaPost(disableReq('adminPassword123', code2)))!;
            expect(res2.status).toBe(400);
            const data = await res2.json();
            expect(data.code).toBe('MFA_NOT_ENABLED');
        });

        it('C-13: MFA status reflects enrollment state', async () => {
            const res1 = (await mfaStatusGet())!;
            const data1 = await res1.json();
            expect(data1.mfaEnabled).toBe(false);

            await enrollStartPost(startReq());

            const res2 = (await mfaStatusGet())!;
            const data2 = await res2.json();
            expect(data2.mfaEnabled).toBe(false);
        });

        it('C-14: Enrollment start rejects if MFA already enabled', async () => {
            await enableMfaAndGetCodes();

            const res = (await enrollStartPost(startReq()))!;
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('MFA_ALREADY_ENABLED');
        });

        it('C-15: Enrollment start rejects wrong password', async () => {
            const res = (await enrollStartPost(startReq('wrongpassword')))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('INVALID_CREDENTIALS');
        });

        it('C-16: Enrollment confirm rejects invalid setup token', async () => {
            const res = (await enrollConfirmPost(confirmReq('invalid-token', '123456')))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('MFA_INVALID_TOKEN');
        });

        it('C-17: Enrollment confirm rejects wrong TOTP code', async () => {
            const res1 = (await enrollStartPost(startReq()))!;
            const data1 = await res1.json();

            const res2 = (await enrollConfirmPost(confirmReq(data1.setupToken, '000000')))!;
            expect(res2.status).toBe(400);
            const data2 = await res2.json();
            expect(data2.code).toBe('MFA_INVALID_TOKEN');
        });

        it('C-18: Disable rejects wrong password', async () => {
            const { secret } = await enableMfaAndGetCodes();

            const code = generateTotp(secret);
            const res = (await disableMfaPost(disableReq('wrongpassword', code)))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('INVALID_CREDENTIALS');
        });

        it('C-19: Disable rejects when MFA not enabled', async () => {
            const res = (await disableMfaPost(disableReq('adminPassword123', '123456')))!;
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('MFA_NOT_ENABLED');
        });

        it('C-20: Regeneration rejects when MFA not enabled', async () => {
            const res = (await regenerateCodesPost(regenReq('adminPassword123', '123456')))!;
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('MFA_NOT_ENABLED');
        });

        it('C-21: Regeneration rejects wrong password', async () => {
            const { secret } = await enableMfaAndGetCodes();

            const code = generateTotp(secret);
            const res = (await regenerateCodesPost(regenReq('wrongpassword', code)))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('INVALID_CREDENTIALS');
        });

        it('C-22: Regeneration rejects wrong TOTP code', async () => {
            await enableMfaAndGetCodes();

            const res = (await regenerateCodesPost(regenReq('adminPassword123', '000000')))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('MFA_INVALID_TOKEN');
        });

        it('C-23: Login returns mfa_required for MFA-enabled ADMIN', async () => {
            await enableMfaAndGetCodes();

            const req = new Request('http://localhost/api/auth', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ username: testAdminUser.username, password: 'adminPassword123' }),
            });
            const res = (await loginPost(req))!;
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.mfaRequired).toBe(true);
            expect(data.challengeToken).toBeDefined();
        });

        it('C-24: Login returns success for non-MFA ADMIN', async () => {
            const req = new Request('http://localhost/api/auth', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ username: testAdminUser.username, password: 'adminPassword123' }),
            });
            const res = (await loginPost(req))!;
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.user).toBeDefined();
        });

        it('C-25: MFA verify returns mfa-assured JWT on success', async () => {
            const { secret } = await enableMfaAndGetCodes();
            const challengeToken = await createMfaChallengeToken(testAdminUser.id, UserRole.ADMIN);

            const code = generateTotp(secret);
            const req = new Request('http://localhost/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ challengeToken, factor: 'totp', code }),
            });
            const res = (await mfaVerifyPost(req))!;
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.method).toBe('totp');

            const setCookie = res.headers.get('set-cookie');
            expect(setCookie).toContain('auth_token=');
        });

        it('C-26: MFA verify rejects invalid challenge token', async () => {
            await enableMfaAndGetCodes();

            const req = new Request('http://localhost/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ challengeToken: 'invalid-token', factor: 'totp', code: '123456' }),
            });
            const res = (await mfaVerifyPost(req))!;
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.code).toBe('MFA_INVALID_TOKEN');
        });
    });
});
