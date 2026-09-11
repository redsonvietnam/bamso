// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockRedis } from './mock-redis';

const mockRedis = new MockRedis();
vi.mock('@/lib/redis', () => ({
    getRedisClient: () => mockRedis,
    getRedisPubSubClient: () => mockRedis,
}));

import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { signJWT } from '@/lib/auth';
import { acquireRegenLock, releaseRegenLock, resetMfaRedisState } from '@/lib/mfa-redis';
import { POST as enrollStartPost } from '@/app/api/admin/mfa/enroll/start/route';
import { POST as enrollConfirmPost } from '@/app/api/admin/mfa/enroll/confirm/route';

const mockCookiesStore = new Map<string, string>();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => (mockCookiesStore.has(name) ? { value: mockCookiesStore.get(name) } : undefined),
        set: (name: string, value: string) => mockCookiesStore.set(name, value),
    })),
}));

describe('MFA C.1 P2 concurrency hardening', () => {
    let userId = '';

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters-for-testing';
        process.env.MFA_ENCRYPTION_KEY = '1234567890123456789012345678901234567890123456789012345678901234';
        mockCookiesStore.clear();
        await resetMfaRedisState();

        const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const user = await prisma.user.create({
            data: {
                username: `test_c1_p2_${suffix}`,
                passwordHash: hashPassword('adminPassword123'),
                name: 'C1 P2 Admin',
                role: 'ADMIN',
                mfaEnabled: false,
            },
            select: { id: true },
        });
        userId = user.id;
    });

    afterEach(async () => {
        await prisma.recoveryCode.deleteMany({ where: { userId } });
        await prisma.auditLog.deleteMany({ where: { actorId: userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.settings.deleteMany({ where: { key: `MFA_REGEN_FENCE:${userId}` } });
        await resetMfaRedisState();
    });

    it('P2-1: simulated lease expiry gives successor a higher fence and stale owner cannot release it', async () => {
        vi.useFakeTimers();
        try {
            const first = await acquireRegenLock(userId);
            expect(typeof first).toBe('object');
            if (typeof first !== 'object') return;

            vi.advanceTimersByTime(31_000);
            const second = await acquireRegenLock(userId);
            expect(typeof second).toBe('object');
            if (typeof second !== 'object') return;

            expect(second.fenceToken).toBeGreaterThan(first.fenceToken);
            expect(await releaseRegenLock(userId, first.ownerToken)).toBe(false);
            expect(await releaseRegenLock(userId, second.ownerToken)).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('P2-1: stale fence cannot pass the SQLite mutation boundary after takeover', async () => {
        const first = await acquireRegenLock(userId);
        expect(typeof first).toBe('object');
        if (typeof first !== 'object') return;

        await mockRedis.del(`bamso:mfa:regen:${userId}`);
        const second = await acquireRegenLock(userId);
        expect(typeof second).toBe('object');
        if (typeof second !== 'object') return;

        const fenceKey = `MFA_REGEN_FENCE:${userId}`;
        await prisma.$executeRaw`
            INSERT INTO "Settings" ("key", "value")
            VALUES (${fenceKey}, ${String(second.fenceToken)})
            ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"
            WHERE CAST("Settings"."value" AS INTEGER) < CAST(excluded."value" AS INTEGER)
        `;

        const staleWrite = await prisma.$executeRaw`
            UPDATE "Settings"
            SET "value" = "value"
            WHERE "key" = ${fenceKey}
              AND CAST("value" AS INTEGER) = ${first.fenceToken}
        `;
        expect(staleWrite).toBe(0);
    });

    it('P2-2: latest authoritative START invalidates the prior setup token', async () => {
        const authToken = await signJWT({ userId, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', authToken);

        const firstRes = await enrollStartPost(new Request('http://localhost/api/admin/mfa/enroll/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123' }),
        }));
        const first = await firstRes.json();
        expect(firstRes.status).toBe(200);

        const secondRes = await enrollStartPost(new Request('http://localhost/api/admin/mfa/enroll/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'adminPassword123' }),
        }));
        expect(secondRes.status).toBe(200);

        const staleConfirm = await enrollConfirmPost(new Request('http://localhost/api/admin/mfa/enroll/confirm', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ setupToken: first.setupToken, code: '000000' }),
        }));

        expect(staleConfirm?.status).toBe(409);
        const staleBody = await staleConfirm!.json();
        expect(staleBody.code).toBe('MFA_ENROLLMENT_STALE');

        const logs = await prisma.auditLog.findMany({
            where: { actorId: userId, action: 'MFA_ENROLL_COMPLETED', reasonCode: 'MFA_ENROLLMENT_STALE' },
        });
        expect(logs).toHaveLength(1);
        expect(logs[0].metadata).toContain('enrollmentJti');
    });

    it('P2-2: concurrent START-B + CONFIRM-A remains linearizable across repeated races', async () => {
        const authToken = await signJWT({ userId, role: 'ADMIN' });
        mockCookiesStore.set('auth_token', authToken);

        for (let i = 0; i < 20; i++) {
            await prisma.user.update({
                where: { id: userId },
                data: { mfaEnabled: false, mfaSecret: null, mfaKeyVersion: null, mfaEnabledAt: null, enrollmentJti: null },
            });
            await prisma.recoveryCode.deleteMany({ where: { userId } });
            await prisma.auditLog.deleteMany({ where: { actorId: userId } });

            const firstRes = await enrollStartPost(new Request('http://localhost/api/admin/mfa/enroll/start', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password: 'adminPassword123' }),
            }));
            const first = await firstRes.json();
            expect(firstRes.status).toBe(200);

            const secondPromise = enrollStartPost(new Request('http://localhost/api/admin/mfa/enroll/start', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password: 'adminPassword123' }),
            }));
            const confirmPromise = enrollConfirmPost(new Request('http://localhost/api/admin/mfa/enroll/confirm', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ setupToken: first.setupToken, code: '000000' }),
            }));

            const [secondRes, confirmRes] = await Promise.all([secondPromise, confirmPromise]);

            // Linearizable outcomes: B commits first => A is stale; A commits first
            // => B observes MFA enabled. No stale A success after B commits.
            if (secondRes.status === 200) {
                expect(confirmRes.status).toBe(409);
                const body = await confirmRes.json();
                expect(body.code).toBe('MFA_ENROLLMENT_STALE');
            } else {
                expect(secondRes.status).toBe(400);
                expect(confirmRes.status).toBe(200);
            }
        }
    });
});
