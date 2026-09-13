// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async () => ({ payload: { userId: 'test-admin', role: 'ADMIN' } })),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/db';
import { PUT } from '@/app/api/services/route';

const TEST_CODE = 'CORE2SVC';

async function cleanupTestService() {
    await prisma.service.deleteMany({ where: { code: TEST_CODE } });
}

async function createTestService() {
    return prisma.service.create({
        data: {
            code: TEST_CODE,
            name: 'Core2 Service',
            description: 'stale-write probe',
            color: '#123456',
            prefix: 'C2',
            order: 1,
        },
        select: { id: true, updatedAt: true },
    });
}

async function putRequest(payload: Record<string, unknown>) {
    const res = await PUT(
        new Request('http://localhost/api/services', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
    );
    if (!res) throw new Error('expected a response');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function revisionOf(id: string) {
    const row = await prisma.service.findUnique({ where: { id } });
    return row!.updatedAt.toISOString();
}

beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestService();
});

afterEach(async () => {
    await cleanupTestService();
});

describe('PUT /api/services stale-write protection (WP-CORE-02)', () => {
    it('fresh PUT succeeds', async () => {
        const svc = await createTestService();
        const res = await putRequest({
            id: svc.id,
            name: 'Renamed Fresh',
            expectedUpdatedAt: await revisionOf(svc.id),
        });
        expect(res.status).toBe(200);
        expect((await prisma.service.findUnique({ where: { id: svc.id } }))?.name).toBe('Renamed Fresh');
    });

    it('stale PUT returns 409 with a stable code', async () => {
        const svc = await createTestService();
        const staleToken = await revisionOf(svc.id);

        // Another admin mutates the row first.
        await prisma.service.update({ where: { id: svc.id }, data: { name: 'Newer Name' } });

        const res = await putRequest({ id: svc.id, name: 'Stale Name', expectedUpdatedAt: staleToken });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STALE_RESOURCE');
    });

    it('stale PUT leaves all DB fields unchanged', async () => {
        const svc = await createTestService();
        const staleToken = await revisionOf(svc.id);
        const before = await prisma.service.findUnique({ where: { id: svc.id } });

        await prisma.service.update({
            where: { id: svc.id },
            data: { name: 'Newer Name', color: '#654321' },
        });

        const res = await putRequest({
            id: svc.id,
            name: 'Stale Name',
            color: '#000000',
            expectedUpdatedAt: staleToken,
        });
        expect(res.status).toBe(409);

        const after = await prisma.service.findUnique({ where: { id: svc.id } });
        expect(after?.name).toBe('Newer Name');
        expect(after?.color).toBe('#654321');
        expect(after?.code).toBe(before?.code);
        expect(after?.prefix).toBe(before?.prefix);
    });

    it('concurrent different-field updates: exactly one wins, no lost update', async () => {
        const svc = await createTestService();
        const token = await revisionOf(svc.id);

        const [byName, byColor] = await Promise.all([
            putRequest({ id: svc.id, name: 'Winner Name', expectedUpdatedAt: token }),
            putRequest({ id: svc.id, color: '#999999', expectedUpdatedAt: token }),
        ]);

        const statuses = [byName.status, byColor.status].sort();
        expect(statuses).toEqual([200, 409]);
        const loser = byName.status === 409 ? byName : byColor;
        expect(loser.body.code).toBe('STALE_RESOURCE');

        // Whichever field won is applied; the loser's field is untouched.
        const row = await prisma.service.findUnique({ where: { id: svc.id } });
        if (byName.status === 200) {
            expect(row?.name).toBe('Winner Name');
            expect(row?.color).toBe('#123456');
        } else {
            expect(row?.color).toBe('#999999');
            expect(row?.name).toBe('Core2 Service');
        }
    });
});
