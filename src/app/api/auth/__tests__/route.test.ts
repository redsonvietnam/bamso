// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    default: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/password', () => ({
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
    needsRehash: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    RATE_LIMITS: {
        auth: { windowMs: 60_000, maxRequests: 50 },
    },
}));

vi.mock('@/lib/cookie', () => ({
    isSecureCookie: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), log: vi.fn() },
}));

vi.mock('@/lib/auth', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@/lib/auth')>();
    return { ...mod, signJWT: vi.fn() };
});

import { POST } from '@/app/api/auth/route';
import prisma from '@/lib/db';
import { signJWT } from '@/lib/auth';
import { verifyPassword, needsRehash } from '@/lib/password';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isSecureCookie } from '@/lib/cookie';

const mockedFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedSignJWT = signJWT as unknown as ReturnType<typeof vi.fn>;
const mockedVerifyPassword = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const mockedNeedsRehash = needsRehash as unknown as ReturnType<typeof vi.fn>;
const mockedCheckRateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;
const mockedGetClientIp = getClientIp as unknown as ReturnType<typeof vi.fn>;
const mockedIsSecureCookie = isSecureCookie as unknown as ReturnType<typeof vi.fn>;

const validUser = {
    id: 'user-1',
    username: 'staff',
    name: 'Staff',
    role: 'STAFF',
    passwordHash: '210000:salt:hash',
};

function makePostRequest(body: unknown) {
    return new Request('http://localhost/api/auth', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockedGetClientIp.mockReturnValue('127.0.0.1');
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
    mockedVerifyPassword.mockReturnValue(true);
    mockedNeedsRehash.mockReturnValue(false);
    mockedIsSecureCookie.mockReturnValue(false);
    mockedSignJWT.mockResolvedValue('token');
});

describe('POST /api/auth', () => {
    it('issues a token for a user with a valid role', async () => {
        mockedFindUnique.mockResolvedValue(validUser);

        const response = await POST(makePostRequest({ username: 'staff', password: 'pass' }));

        expect(response.status).toBe(200);
        expect(mockedSignJWT).toHaveBeenCalledWith({ userId: 'user-1', role: 'STAFF' });
    });

    it('fails safely with 500 and does not sign a token when the DB role is invalid', async () => {
        mockedFindUnique.mockResolvedValue({ ...validUser, role: 'SUPERADMIN' });

        const response = await POST(makePostRequest({ username: 'staff', password: 'pass' }));

        expect(response.status).toBe(500);
        expect(mockedSignJWT).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ code: 'SERVER_ERROR' });
    });
});