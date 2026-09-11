// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MockRedis } from './mock-redis';

const mockRedis = new MockRedis();
vi.mock('@/lib/redis', () => ({
    getRedisClient: () => mockRedis,
    getRedisPubSubClient: () => mockRedis,
}));

import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { signJWT } from '@/lib/auth';
import { UserRole } from '@/lib/constants';
import { generateTotp } from '@/lib/mfa-service';
import { acquireRegenLock, releaseRegenLock, resetMfaRedisState } from '@/lib/mfa-redis';
import { POST as enrollStartPost } from '@/app/api/admin/mfa/enroll/start/route';
import { POST as enrollConfirmPost } from '@/app/api/admin/mfa/enroll/confirm/route';

const TEST_MFA_KEY = '1234567890123456789012345678901234567890123456789012345678901234';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
        set: (name: string, value: string) => cookieStore.set(name, value),
    })),
}));

describe('MFA C.1 P2 concurrency proofs', () => {
    const originalEnv = { ...process.env };
    let admin: { id: string; username: string };

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters-for-testing';
        process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY;
        cookieStore.clear();
        await resetMfaRedisState();

        admin = await prisma.user.create({
            data: {
                username: `c1_p2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                passwordHash: hashPassword('adminPassword123'),
                name: 'C1 P2 Admin',
                role: 'ADMIN',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });
    });

    afterEach(async () => {
        vi.useRealTimers();
        if (admin?.id) {
            await prisma.recoveryCode.deleteMany({ where: { userId: admin.id } });
            await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
            await prisma.user.deleteMany({ where: { id: admin.id } });
        }
        await resetMfaRedisState();
        process.env = { ...originalEnv };
    });

    it('P2-RECOVERY-LOCK: expired owner cannot release successor lock', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-11T06:00:00.000Z'));

        const first = await acquireRegenLock(admin.id);
        expect(typeof first).toBe('object');
        if (typeof first !== 'object') return;

        vi.advanceTimersByTime(31_000);

        const second = await acquireRegenLock(admin.id);
        expect(typeof second).toBe('object');
        if (typeof second !== 'object') return;
        expect(second.fenceToken).toBeGreaterThan(first.fenceToken);

        const staleRelease = await releaseRegenLock(admin.id, first.ownerToken);
        expect(staleRelease).toBe(false);

        const third = await acquireRegenLock(admin.id);
        expect(third).toBe('ALREADY_CLAIMED');

        await releaseRegenLock(admin.id, second.ownerToken);
        const afterRelease = await acquireRegenLock(admin.id);
        expect(typeof afterRelease).toBe('object');
        if (typeof afterRelease === 'object') {
            expect(afterRelease.fenceToken).toBeGreaterThan(second.fenceToken);
            await releaseRegenLock(admin.id, afterRelease.ownerToken);
        }
    });

    it('P2-ENROLLMENT-START-CONFIRM: concurrent new START and old CONFIRM yield one coherent generation', async () => {
        const authToken = await signJWT({ userId: admin.id, role: UserRole.ADMIN });
        cookieStore.set('auth_token', authToken);

        const startA = await enrollStartPost(
            new Request('http://localhost/api/admin/mfa/enroll/start', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password: 'adminPassword123' }),
            })
        );
        expect(startA.status).toBe(200);
        const setupA = await startA.json();

        const [startB, confirmA] = await Promise.all([
            enrollStartPost(
                new Request('http://localhost/api/admin/mfa/enroll/start', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ password: 'adminPassword123' }),
                })
            ),
            enrollConfirmPost(
                new Request('http://localhost/api/admin/mfa/enroll/confirm', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        setupToken: setupA.setupToken,
                        code: generateTotp(setupA.secret),
                    }),
                })
            ),
        ]);

        expect([200, 409]).toContain(confirmA.status);
        expect([200, 400]).toContain(startB.status);

        const finalUser = await prisma.user.findUnique({
            where: { id: admin.id },
            select: { mfaEnabled: true, enrollmentJti: true },
        });
        expect(finalUser).not.toBeNull();

        if (startB.status === 200) {
            expect(confirmA.status).toBe(409);
            expect(finalUser?.mfaEnabled).toBe(false);
            expect(finalUser?.enrollmentJti).not.toBeNull();

            const setupB = await startB.json();
            const confirmB = await enrollConfirmPost(
                new Request('http://localhost/api/admin/mfa/enroll/confirm', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        setupToken: setupB.setupToken,
                        code: generateTotp(setupB.secret),
                    }),
                })
            );
            expect(confirmB.status).toBe(200);
        } else {
            expect(confirmA.status).toBe(200);
            expect(finalUser?.mfaEnabled).toBe(true);
            expect(finalUser?.enrollmentJti).toBeNull();
        }
    });
});
