// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuditCreate } = vi.hoisted(() => ({
    mockAuditCreate: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}));

vi.mock('@/lib/db', () => ({
    default: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        auditLog: {
            create: mockAuditCreate,
        },
    },
}));

vi.mock('@/lib/password', () => ({
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
    needsRehash: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
    RATE_LIMITS: {
        auth: { windowMs: 60_000, maxRequests: 50 },
    },
}));

vi.mock('@/lib/cookie', () => ({
    isSecureCookie: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), log: vi.fn() },
}));

vi.mock('@/lib/auth', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@/lib/auth')>();
    return { ...mod, signJWT: vi.fn().mockResolvedValue('fake-jwt-token') };
});

import { POST } from '@/app/api/auth/route';
import prisma from '@/lib/db';
import { verifyPassword } from '@/lib/password';

const mockedFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedVerifyPassword = verifyPassword as unknown as ReturnType<typeof vi.fn>;

describe('LOGIN Audit Trail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates successful LOGIN audit when credentials match', async () => {
        mockedFindUnique.mockResolvedValue({
            id: 'u-100',
            username: 'canbo1',
            name: 'Cán bộ 1',
            role: 'STAFF',
            passwordHash: 'hashed_pwd',
        });
        mockedVerifyPassword.mockReturnValue(true);

        const request = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'canbo1', password: 'correct_password' }),
        });

        const res = await POST(request);
        expect(res.status).toBe(200);

        expect(mockAuditCreate).toHaveBeenCalledTimes(1);
        const callArg = mockAuditCreate.mock.calls[0][0];
        expect(callArg.data).toMatchObject({
            actorType: 'USER',
            actorId: 'u-100',
            actorRole: 'STAFF',
            action: 'LOGIN',
            entityType: 'AUTH',
            entityId: 'u-100',
            success: true,
            reasonCode: null,
        });

        // Ensure password is not recorded in audit call
        expect(JSON.stringify(callArg)).not.toContain('correct_password');
    });

    it('creates failed LOGIN audit when password is invalid', async () => {
        mockedFindUnique.mockResolvedValue({
            id: 'u-100',
            username: 'canbo1',
            name: 'Cán bộ 1',
            role: 'STAFF',
            passwordHash: 'hashed_pwd',
        });
        mockedVerifyPassword.mockReturnValue(false);

        const request = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'canbo1', password: 'wrong_password' }),
        });

        const res = await POST(request);
        expect(res.status).toBe(401);

        expect(mockAuditCreate).toHaveBeenCalledTimes(1);
        const callArg = mockAuditCreate.mock.calls[0][0];
        expect(callArg.data).toMatchObject({
            actorType: 'USER',
            actorId: 'u-100',
            actorRole: 'STAFF',
            action: 'LOGIN',
            entityType: 'AUTH',
            entityId: 'u-100',
            success: false,
            reasonCode: 'INVALID_CREDENTIALS',
        });

        expect(JSON.stringify(callArg)).not.toContain('wrong_password');
    });

    it('creates failed LOGIN audit with ANONYMOUS when user is unknown', async () => {
        mockedFindUnique.mockResolvedValue(null);

        const request = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'nonexistent', password: 'some_password' }),
        });

        const res = await POST(request);
        expect(res.status).toBe(401);

        expect(mockAuditCreate).toHaveBeenCalledTimes(1);
        const callArg = mockAuditCreate.mock.calls[0][0];
        expect(callArg.data).toMatchObject({
            actorType: 'ANONYMOUS',
            actorId: null,
            actorRole: null,
            action: 'LOGIN',
            entityType: 'AUTH',
            entityId: null,
            success: false,
            reasonCode: 'INVALID_CREDENTIALS',
        });
    });

    it('creates failed LOGIN audit when credentials are missing', async () => {
        const request = new Request('http://localhost/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'canbo1' }),
        });

        const res = await POST(request);
        expect(res.status).toBe(400);

        expect(mockAuditCreate).toHaveBeenCalledTimes(1);
        const callArg = mockAuditCreate.mock.calls[0][0];
        expect(callArg.data).toMatchObject({
            actorType: 'ANONYMOUS',
            action: 'LOGIN',
            entityType: 'AUTH',
            success: false,
            reasonCode: 'MISSING_CREDENTIALS',
        });
    });
});
