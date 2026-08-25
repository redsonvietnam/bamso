import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/db', () => ({
    default: {
        ticket: {
            count: vi.fn(),
            findMany: vi.fn(),
            groupBy: vi.fn(),
        },
        service: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET } from '@/app/api/stats/route';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

const mockedTicketCount = prisma.ticket.count as unknown as ReturnType<typeof vi.fn>;
const mockedTicketFindMany = prisma.ticket.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedTicketGroupBy = prisma.ticket.groupBy as unknown as ReturnType<typeof vi.fn>;
const mockedServiceFindMany = prisma.service.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedRequireRole = requireRole as unknown as ReturnType<typeof vi.fn>;

function adminAuth() {
    mockedRequireRole.mockResolvedValue({ payload: { userId: 'admin-1', role: 'ADMIN' } });
}

function rejectAuth() {
    mockedRequireRole.mockResolvedValue({
        error: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    adminAuth();
    mockedTicketCount.mockResolvedValue(0);
    mockedTicketFindMany.mockResolvedValue([]);
    mockedTicketGroupBy.mockResolvedValue([]);
    mockedServiceFindMany.mockResolvedValue([]);
});

function makeRequest(url: string) {
    return new Request(`http://localhost${url}`);
}

async function callGet(url: string): Promise<Response> {
    return (await GET(makeRequest(url))) as Response;
}

describe('GET /api/stats', () => {
    describe('authorization', () => {
        it('rejects non-admin users', async () => {
            rejectAuth();
            const res = await callGet('/api/stats');
            expect(res.status).toBe(403);
        });
    });

    describe('single-date compatibility', () => {
        it('defaults to today when no params', async () => {
            const res = await callGet('/api/stats');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('summary');
            expect(data).toHaveProperty('hourly');
            expect(data).toHaveProperty('services');
        });

        it('accepts legacy date param', async () => {
            const res = await callGet('/api/stats?date=2026-08-15');
            expect(res.status).toBe(200);
        });

        it('rejects invalid date param', async () => {
            const res = await callGet('/api/stats?date=not-a-date');
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('INVALID_DATE');
        });
    });

    describe('date range parameters', () => {
        it('accepts from and to params', async () => {
            const res = await callGet('/api/stats?from=2026-08-01&to=2026-08-21');
            expect(res.status).toBe(200);
        });

        it('accepts only from param (to defaults to from)', async () => {
            const res = await callGet('/api/stats?from=2026-08-15');
            expect(res.status).toBe(200);
        });

        it('accepts only to param (from defaults to today)', async () => {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const res = await callGet(`/api/stats?to=${today}`);
            expect(res.status).toBe(200);
        });

        it('rejects invalid from date', async () => {
            const res = await callGet('/api/stats?from=invalid');
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('INVALID_DATE');
        });

        it('rejects invalid to date', async () => {
            const res = await callGet('/api/stats?to=invalid');
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('INVALID_DATE');
        });

        it('rejects from > to', async () => {
            const res = await callGet('/api/stats?from=2026-08-21&to=2026-08-01');
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.code).toBe('INVALID_RANGE');
        });

        it('allows from = to (single day via range)', async () => {
            const res = await callGet('/api/stats?from=2026-08-15&to=2026-08-15');
            expect(res.status).toBe(200);
        });
    });

    describe('aggregation correctness', () => {
        it('returns correct summary counts', async () => {
            mockedTicketCount
                .mockResolvedValueOnce(10)
                .mockResolvedValueOnce(7)
                .mockResolvedValueOnce(1)
                .mockResolvedValueOnce(1)
                .mockResolvedValueOnce(1);

            const res = await callGet('/api/stats?date=2026-08-15');
            const data = await res.json();

            expect(data.summary.total).toBe(10);
            expect(data.summary.completed).toBe(7);
            expect(data.summary.missed).toBe(1);
            expect(data.summary.pending).toBe(1);
            expect(data.summary.active).toBe(1);
        });

        it('calculates avg wait time from raw durations', async () => {
            const now = Date.now();
            mockedTicketCount.mockResolvedValue(0);
            mockedTicketFindMany
                .mockResolvedValueOnce([
                    { createdAt: new Date(now - 600000), completedAt: new Date(now - 300000) },
                    { createdAt: new Date(now - 400000), completedAt: new Date(now - 100000) },
                ])
                .mockResolvedValue([]);
            mockedTicketGroupBy.mockResolvedValue([]);

            const res = await callGet('/api/stats?date=2026-08-15');
            const data = await res.json();

            expect(data.summary.avgWaitTimeSeconds).toBe(300);
        });

        it('returns zero avg wait time when no completed tickets', async () => {
            const res = await callGet('/api/stats?date=2026-08-15');
            const data = await res.json();
            expect(data.summary.avgWaitTimeSeconds).toBe(0);
        });
    });
});
