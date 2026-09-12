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

const TEST_CODE = 'CORE1SVC';

async function cleanupTestService() {
    await prisma.service.deleteMany({ where: { code: TEST_CODE } });
}

async function createTestService() {
    return prisma.service.create({
        data: {
            code: TEST_CODE,
            name: 'Core1 Service',
            description: 'validation probe',
            color: '#123456',
            prefix: 'C1',
            order: 1,
        },
        select: { id: true },
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

async function currentRow(id: string) {
    return prisma.service.findUnique({ where: { id } });
}

beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestService();
});

afterEach(async () => {
    await cleanupTestService();
});

describe('PUT /api/services blank validation (CORE-02)', () => {
    it('rejects blank code', async () => {
        const svc = await createTestService();
        const res = await putRequest({ id: svc.id, code: '' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELDS');
        expect((await currentRow(svc.id))?.code).toBe(TEST_CODE);
    });

    it('rejects whitespace-only name', async () => {
        const svc = await createTestService();
        const res = await putRequest({ id: svc.id, name: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FIELDS');
        expect((await currentRow(svc.id))?.name).toBe('Core1 Service');
    });

    it('rejects blank color and blank prefix', async () => {
        const svc = await createTestService();

        const blankColor = await putRequest({ id: svc.id, color: '' });
        expect(blankColor.status).toBe(400);
        expect(blankColor.body.code).toBe('INVALID_FIELDS');

        const blankPrefix = await putRequest({ id: svc.id, prefix: '  ' });
        expect(blankPrefix.status).toBe(400);
        expect(blankPrefix.body.code).toBe('INVALID_FIELDS');

        const row = await currentRow(svc.id);
        expect(row?.color).toBe('#123456');
        expect(row?.prefix).toBe('C1');
    });

    it('preserves valid partial update', async () => {
        const svc = await createTestService();
        const res = await putRequest({ id: svc.id, name: 'Renamed Service' });
        expect(res.status).toBe(200);

        const row = await currentRow(svc.id);
        expect(row?.name).toBe('Renamed Service');
        expect(row?.code).toBe(TEST_CODE);
        expect(row?.color).toBe('#123456');
        expect(row?.prefix).toBe('C1');
    });
});
