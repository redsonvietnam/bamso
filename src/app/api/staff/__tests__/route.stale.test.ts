// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async () => ({ payload: { userId: 'test-admin', role: 'ADMIN' } })),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/db';
import { PUT } from '@/app/api/staff/route';

const PREFIX = 'core2_';

async function cleanupTestUsers() {
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
}

async function createStaff(username: string) {
    return prisma.user.create({
        data: {
            username,
            passwordHash: 'test-hash-not-verified',
            name: 'Original Name',
            role: 'STAFF',
        },
        select: { id: true },
    });
}

async function revisionOf(id: string) {
    const row = await prisma.user.findUnique({ where: { id } });
    return row!.updatedAt!.toISOString();
}

async function putRequest(payload: Record<string, unknown>) {
    const res = await PUT(
        new Request('http://localhost/api/staff', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestUsers();
});

afterEach(async () => {
    await cleanupTestUsers();
});

describe('PUT /api/staff stale-write protection (WP-CORE-02)', () => {
    it('fresh PUT succeeds', async () => {
        const staff = await createStaff(`${PREFIX}fresh`);
        const res = await putRequest({
            id: staff.id,
            name: 'Fresh Name',
            expectedUpdatedAt: await revisionOf(staff.id),
        });
        expect(res.status).toBe(200);
        expect((await prisma.user.findUnique({ where: { id: staff.id } }))?.name).toBe('Fresh Name');
    });

    it('stale PUT returns 409 with a stable code', async () => {
        const staff = await createStaff(`${PREFIX}stale`);
        const staleToken = await revisionOf(staff.id);

        // Another admin mutates the row first.
        await prisma.user.update({ where: { id: staff.id }, data: { name: 'Newer Name' } });

        const res = await putRequest({ id: staff.id, name: 'Stale Name', expectedUpdatedAt: staleToken });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STALE_RESOURCE');
    });

    it('stale PUT leaves the DB unchanged', async () => {
        const staff = await createStaff(`${PREFIX}unchanged`);
        const staleToken = await revisionOf(staff.id);

        await prisma.user.update({ where: { id: staff.id }, data: { name: 'Newer Name', role: 'KIOSK' } });

        const res = await putRequest({
            id: staff.id,
            name: 'Stale Name',
            role: 'DISPLAY',
            expectedUpdatedAt: staleToken,
        });
        expect(res.status).toBe(409);

        const row = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(row?.name).toBe('Newer Name');
        expect(row?.role).toBe('KIOSK');
    });

    it('concurrent name/role updates: exactly one wins, no silent overwrite', async () => {
        const staff = await createStaff(`${PREFIX}race`);
        const token = await revisionOf(staff.id);

        const [byName, byRole] = await Promise.all([
            putRequest({ id: staff.id, name: 'Winner Name', expectedUpdatedAt: token }),
            putRequest({ id: staff.id, role: 'KIOSK', expectedUpdatedAt: token }),
        ]);

        const statuses = [byName.status, byRole.status].sort();
        expect(statuses).toEqual([200, 409]);
        const loser = byName.status === 409 ? byName : byRole;
        expect(loser.body.code).toBe('STALE_RESOURCE');

        const row = await prisma.user.findUnique({ where: { id: staff.id } });
        if (byName.status === 200) {
            expect(row?.name).toBe('Winner Name');
            expect(row?.role).toBe('STAFF');
        } else {
            expect(row?.role).toBe('KIOSK');
            expect(row?.name).toBe('Original Name');
        }
    });

    it('password update with a stale snapshot is rejected and the hash is untouched', async () => {
        const staff = await createStaff(`${PREFIX}pwd`);
        const before = await prisma.user.findUnique({ where: { id: staff.id } });
        const staleToken = await revisionOf(staff.id);

        // Another admin changes something first, rotating the revision.
        await prisma.user.update({ where: { id: staff.id }, data: { name: 'Newer Name' } });

        const res = await putRequest({
            id: staff.id,
            password: 'NewPassword123',
            expectedUpdatedAt: staleToken,
        });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STALE_RESOURCE');

        const after = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(after?.passwordHash).toBe(before?.passwordHash);
        expect(after?.name).toBe('Newer Name');
    });

    it('MFA fields remain unchanged by Staff PUT', async () => {
        const staff = await createStaff(`${PREFIX}mfa`);
        await prisma.user.update({
            where: { id: staff.id },
            data: {
                mfaEnabled: true,
                mfaSecret: 'enc-secret',
                mfaKeyVersion: 'v1',
                mfaEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
            },
        });

        const res = await putRequest({
            id: staff.id,
            name: 'MFA User Renamed',
            expectedUpdatedAt: await revisionOf(staff.id),
        });
        expect(res.status).toBe(200);

        const row = await prisma.user.findUnique({ where: { id: staff.id } });
        expect(row?.name).toBe('MFA User Renamed');
        expect(row?.mfaEnabled).toBe(true);
        expect(row?.mfaSecret).toBe('enc-secret');
        expect(row?.mfaKeyVersion).toBe('v1');
    });
});
