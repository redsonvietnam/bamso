import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    default: {
        $queryRaw: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET } from '@/app/api/health/route';
import prisma from '@/lib/db';

const mockedQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

describe('GET /api/health', () => {
    it('returns connected when the database probe succeeds', async () => {
        mockedQueryRaw.mockResolvedValue([{ ok: 1 }]);

        const response = await GET();
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true, db: 'connected' });
    });

    it('does not expose raw database errors', async () => {
        mockedQueryRaw.mockRejectedValue(new Error('SQLITE: secret internal detail'));

        const response = await GET();
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            ok: false,
            db: 'disconnected',
            error: 'Database unavailable',
        });
    });
});