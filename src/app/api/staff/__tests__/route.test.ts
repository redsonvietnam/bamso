import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/db', () => ({
    default: {
        user: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/password', () => ({
    hashPassword: vi.fn(() => 'hashed-password'),
    validatePassword: vi.fn(() => ({ valid: true })),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET, POST, DELETE } from '@/app/api/staff/route';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

const mockedFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = prisma.user.create as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = prisma.user.delete as unknown as ReturnType<typeof vi.fn>;
const mockedFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedRequireRole = requireRole as unknown as ReturnType<typeof vi.fn>;

const mockStaff = [
    { id: '1', username: 'staff1', name: 'Staff One', role: 'STAFF', createdAt: new Date(), updatedAt: new Date() },
    { id: '2', username: 'kiosk1', name: 'Kiosk One', role: 'KIOSK', createdAt: new Date(), updatedAt: new Date() },
];

function adminAuth() {
    mockedRequireRole.mockResolvedValue({ payload: { userId: 'admin-1', role: 'ADMIN' } });
}

function rejectAuth() {
    mockedRequireRole.mockResolvedValue({
        error: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
    });
}

function unauthorizedAuth() {
    mockedRequireRole.mockResolvedValue({
        error: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/staff', () => {
    it('returns 401 when no auth cookie', async () => {
        unauthorizedAuth();
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(401);
        expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when non-admin role', async () => {
        rejectAuth();
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(403);
        expect(body.code).toBe('FORBIDDEN');
    });

    it('returns staff list for ADMIN', async () => {
        adminAuth();
        mockedFindMany.mockResolvedValue(mockStaff);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
        expect(body[0].username).toBe('staff1');
        expect(body[1].username).toBe('kiosk1');
        expect(mockedFindMany).toHaveBeenCalledWith({
            where: { role: { in: ['STAFF', 'KIOSK', 'DISPLAY'] } },
            select: { id: true, username: true, name: true, role: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: 'desc' },
        });
    });

    it('returns 500 on database error', async () => {
        adminAuth();
        mockedFindMany.mockRejectedValue(new Error('DB error'));
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.code).toBe('INTERNAL_ERROR');
    });
});

describe('POST /api/staff', () => {
    it('returns 403 for non-admin', async () => {
        rejectAuth();
        const req = new Request('http://localhost/api/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'new', password: 'password123', name: 'New', role: 'STAFF' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('returns 400 when fields missing', async () => {
        adminAuth();
        const req = new Request('http://localhost/api/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'new' }),
        });
        const res = await POST(req);
        const body = await res.json();
        expect(res.status).toBe(400);
        expect(body.code).toBe('MISSING_FIELDS');
    });

    it('creates staff for ADMIN', async () => {
        adminAuth();
        mockedFindUnique.mockResolvedValue(null);
        mockedCreate.mockResolvedValue({ id: '3', username: 'new', name: 'New', role: 'STAFF', createdAt: new Date() });
        const req = new Request('http://localhost/api/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'new', password: 'password123', name: 'New', role: 'STAFF' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(201);
    });
});

describe('DELETE /api/staff', () => {
    it('returns 403 for non-admin', async () => {
        rejectAuth();
        const req = new Request('http://localhost/api/staff?id=1');
        const res = await DELETE(req);
        expect(res.status).toBe(403);
    });

    it('deletes staff for ADMIN', async () => {
        adminAuth();
        mockedFindUnique.mockResolvedValue({ role: 'STAFF' });
        mockedDelete.mockResolvedValue({});
        const req = new Request('http://localhost/api/staff?id=1');
        const res = await DELETE(req);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });
});
