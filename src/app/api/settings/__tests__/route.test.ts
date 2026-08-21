import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/db', () => ({
    default: {
        settings: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET, PUT } from '@/app/api/settings/route';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

const mockedFindMany = prisma.settings.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedFindUnique = prisma.settings.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedUpsert = prisma.settings.upsert as unknown as ReturnType<typeof vi.fn>;
const mockedRequireRole = requireRole as unknown as ReturnType<typeof vi.fn>;

const mockSettings = [
    { key: 'tts_speed', value: '0.9' },
    { key: 'tts_provider', value: 'google' },
];

function adminAuth() {
    mockedRequireRole.mockResolvedValue({ payload: { userId: 'admin-1', role: 'ADMIN' } });
}

function rejectAuth() {
    mockedRequireRole.mockResolvedValue({
        error: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
    });
}

function noAuth() {
    mockedRequireRole.mockResolvedValue({
        error: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/settings', () => {
    it('returns 401 without auth', async () => {
        noAuth();
        const req = new Request('http://localhost/api/settings');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin', async () => {
        rejectAuth();
        const req = new Request('http://localhost/api/settings');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(403);
    });

    it('returns all settings for ADMIN', async () => {
        adminAuth();
        mockedFindMany.mockResolvedValue(mockSettings);
        const req = new Request('http://localhost/api/settings');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual(mockSettings);
    });

    it('returns specific setting by key for ADMIN', async () => {
        adminAuth();
        mockedFindUnique.mockResolvedValue({ key: 'tts_speed', value: '0.9' });
        const req = new Request('http://localhost/api/settings?key=tts_speed');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ key: 'tts_speed', value: '0.9' });
    });

    it('returns null value for missing key', async () => {
        adminAuth();
        mockedFindUnique.mockResolvedValue(null);
        const req = new Request('http://localhost/api/settings?key=nonexistent');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ key: 'nonexistent', value: null });
    });

    it('returns 500 on database error', async () => {
        adminAuth();
        mockedFindMany.mockRejectedValue(new Error('DB connection failed'));
        const req = new Request('http://localhost/api/settings');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.code).toBe('INTERNAL_ERROR');
    });
});

describe('PUT /api/settings', () => {
    it('returns 401 without auth', async () => {
        noAuth();
        const req = new Request('http://localhost/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ key: 'tts_speed', value: '1.0' }),
        });
        const res = await PUT(req) as NextResponse;
        expect(res.status).toBe(401);
    });

    it('upserts setting for ADMIN', async () => {
        adminAuth();
        mockedUpsert.mockResolvedValue({ key: 'tts_speed', value: '1.0' });
        const req = new Request('http://localhost/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ key: 'tts_speed', value: '1.0' }),
        });
        const res = await PUT(req) as NextResponse;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ key: 'tts_speed', value: '1.0' });
    });

    it('returns 400 for missing params', async () => {
        adminAuth();
        const req = new Request('http://localhost/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ key: 'tts_speed' }),
        });
        const res = await PUT(req) as NextResponse;
        expect(res.status).toBe(400);
    });
});
