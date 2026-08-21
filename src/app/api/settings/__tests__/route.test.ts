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
    describe('PUBLIC keys — anonymous access (no auth required)', () => {
        const publicKeys = [
            'counters',
            'agency_name',
            'thank_you_text',
            'thank_you_voice_template',
            'tts_enabled',
            'tts_speed',
            'tts_volume',
            'tts_provider',
            'tts_edge_voice',
            'tts_announcement_template',
            'tts_prepare_template',
            'surface_opacity',
            'font_sans',
            'font_display',
        ];

        for (const key of publicKeys) {
            it(`GET ?key=${key} → 200 for anonymous`, async () => {
                mockedFindUnique.mockResolvedValue({ key, value: 'test-value' });
                const req = new Request(`http://localhost/api/settings?key=${key}`);
                const res = await GET(req) as NextResponse;
                expect(res.status).toBe(200);
                const data = await res.json();
                expect(data.key).toBe(key);
            });
        }

        it('returns 200 for STAFF (counters)', async () => {
            mockedFindUnique.mockResolvedValue({ key: 'counters', value: 'Q1,Q2' });
            const req = new Request('http://localhost/api/settings?key=counters');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(200);
        });

        it('returns 200 for ADMIN (counters)', async () => {
            adminAuth();
            mockedFindUnique.mockResolvedValue({ key: 'counters', value: 'Q1,Q2' });
            const req = new Request('http://localhost/api/settings?key=counters');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(200);
        });

        it('returns null value for missing public key', async () => {
            mockedFindUnique.mockResolvedValue(null);
            const req = new Request('http://localhost/api/settings?key=counters');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ key: 'counters', value: null });
        });
    });

    describe('ADMIN-only keys', () => {
        it('skip_rules → 200 for ADMIN', async () => {
            adminAuth();
            mockedFindUnique.mockResolvedValue({ key: 'skip_rules', value: '1,3,5,MISSED' });
            const req = new Request('http://localhost/api/settings?key=skip_rules');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(200);
        });

        it('skip_rules → 403 for STAFF', async () => {
            rejectAuth();
            const req = new Request('http://localhost/api/settings?key=skip_rules');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(403);
        });

        it('skip_rules → 401 for anonymous', async () => {
            noAuth();
            const req = new Request('http://localhost/api/settings?key=skip_rules');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(401);
        });

        it('custom_themes → 200 for ADMIN', async () => {
            adminAuth();
            mockedFindUnique.mockResolvedValue({ key: 'custom_themes', value: '[]' });
            const req = new Request('http://localhost/api/settings?key=custom_themes');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(200);
        });

        it('custom_themes → 403 for STAFF', async () => {
            rejectAuth();
            const req = new Request('http://localhost/api/settings?key=custom_themes');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(403);
        });

        it('custom_themes → 401 for anonymous', async () => {
            noAuth();
            const req = new Request('http://localhost/api/settings?key=custom_themes');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(401);
        });
    });

    describe('GET without key (admin-only)', () => {
        it('returns 200 for ADMIN', async () => {
            adminAuth();
            mockedFindMany.mockResolvedValue(mockSettings);
            const req = new Request('http://localhost/api/settings');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual(mockSettings);
        });

        it('returns 403 for STAFF', async () => {
            rejectAuth();
            const req = new Request('http://localhost/api/settings');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(403);
        });

        it('returns 401 for anonymous', async () => {
            noAuth();
            const req = new Request('http://localhost/api/settings');
            const res = await GET(req) as NextResponse;
            expect(res.status).toBe(401);
        });
    });

    it('returns null value for missing key (ADMIN)', async () => {
        adminAuth();
        mockedFindUnique.mockResolvedValue(null);
        const req = new Request('http://localhost/api/settings?key=nonexistent');
        const res = await GET(req) as NextResponse;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ key: 'nonexistent', value: null });
    });

    it('returns 500 on database error (ADMIN)', async () => {
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

    it('returns 403 for STAFF', async () => {
        rejectAuth();
        const req = new Request('http://localhost/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ key: 'tts_speed', value: '1.0' }),
        });
        const res = await PUT(req) as NextResponse;
        expect(res.status).toBe(403);
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
