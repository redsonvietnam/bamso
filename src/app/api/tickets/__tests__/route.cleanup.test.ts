import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from '@/app/api/tickets/route';
import { requireRole } from '@/lib/api-auth';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(),
    authenticateOptional: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

const mockedRequireRole = requireRole as ReturnType<typeof vi.fn>;

function makeDeleteRequest(body: unknown) {
    return new Request('http://localhost/api/tickets', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('DELETE /api/tickets — bulk cleanup', () => {
    it('returns 401 for unauthenticated request', async () => {
        mockedRequireRole.mockResolvedValue({
            error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        });

        const res = await DELETE(makeDeleteRequest({ cutoff: '2026-08-01' }));
        expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
        mockedRequireRole.mockResolvedValue({
            error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
        });

        const res = await DELETE(makeDeleteRequest({ cutoff: '2026-08-01' }));
        expect(res.status).toBe(403);
    });

    it('returns 400 for missing cutoff', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const res = await DELETE(makeDeleteRequest({}));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.code).toBe('INVALID_FIELDS');
    });

    it('returns 400 for invalid cutoff date', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const res = await DELETE(makeDeleteRequest({ cutoff: 'not-a-date' }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.code).toBe('INVALID_FIELDS');
    });

    it('returns 400 when cutoff is today or future', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const res = await DELETE(makeDeleteRequest({ cutoff: todayStr }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('trước ngày hôm nay');
    });

    it('returns 0 deleted when no eligible tickets exist', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const { default: prismaMock } = await import('@/lib/db');
        const mockTx = {
            ticket: {
                findMany: vi.fn().mockResolvedValue([]),
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
        };
        vi.mocked(prismaMock.$transaction).mockImplementation(async (fn: Parameters<typeof prismaMock.$transaction>[0]) => fn(mockTx as never));

        const res = await DELETE(makeDeleteRequest({ cutoff: '2026-08-01' }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.deleted).toBe(0);
    });

    it('deletes only COMPLETED and MISSED tickets before cutoff', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const { default: prismaMock } = await import('@/lib/db');
        const mockTx = {
            ticket: {
                findMany: vi.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }, { id: 't3' }]),
                deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
            },
        };
        vi.mocked(prismaMock.$transaction).mockImplementation(async (fn: Parameters<typeof prismaMock.$transaction>[0]) => fn(mockTx as never));

        const res = await DELETE(makeDeleteRequest({ cutoff: '2026-08-01' }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.deleted).toBe(3);
        expect(mockTx.ticket.findMany).toHaveBeenCalledWith({
            where: {
                createdAt: { lt: expect.any(Date) },
                status: { in: ['COMPLETED', 'MISSED'] },
            },
            select: { id: true },
        });
    });

    it('uses transaction for atomicity', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const { default: prismaMock } = await import('@/lib/db');
        const mockTx = {
            ticket: {
                findMany: vi.fn().mockResolvedValue([{ id: 't1' }]),
                deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
        };
        vi.mocked(prismaMock.$transaction).mockImplementation(async (fn: Parameters<typeof prismaMock.$transaction>[0]) => fn(mockTx as never));

        await DELETE(makeDeleteRequest({ cutoff: '2026-08-01' }));
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('returns 500 on transaction failure', async () => {
        mockedRequireRole.mockResolvedValue({ payload: { role: 'ADMIN' } });

        const { default: prismaMock } = await import('@/lib/db');
        vi.mocked(prismaMock.$transaction).mockRejectedValue(new Error('DB error'));

        const res = await DELETE(makeDeleteRequest({ cutoff: '2026-08-01' }));
        expect(res.status).toBe(500);
    });
});
