// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { signJWT } from '@/lib/auth';
import { generateTotpSecret, encryptMfaSecret } from '@/lib/mfa-service';

// Mock cookies for Next.js headers
const mockCookiesStore = new Map<string, string>();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => (mockCookiesStore.has(name) ? { value: mockCookiesStore.get(name) } : undefined),
        set: (name: string, value: string) => mockCookiesStore.set(name, value),
    })),
}));

// Mock logger to suppress debug output
vi.mock('@/lib/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock Redis (required by some imports)
vi.mock('@/lib/redis', () => ({
    getRedisClient: () => ({
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        ttl: vi.fn(),
    }),
    getRedisPubSubClient: () => ({
        publish: vi.fn(),
        subscribe: vi.fn(),
    }),
}));

import { proxy } from '@/proxy';

describe('B1-PROXY: proxy() MFA authorization boundary', () => {
    const originalEnv = { ...process.env };
    let testAdminUser: { id: string; username: string };
    let testStaffUser: { id: string; username: string };
    let testKioskUser: { id: string; username: string };
    let testDisplayUser: { id: string; username: string };

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters-for-testing';
        process.env.MFA_ENCRYPTION_KEY = '1234567890123456789012345678901234567890123456789012345678901234';
        mockCookiesStore.clear();

        const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        testAdminUser = await prisma.user.create({
            data: {
                username: `test_admin_proxy_${suffix}`,
                passwordHash: hashPassword('adminPass123'),
                name: 'Test Admin Proxy',
                role: 'ADMIN',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });

        testStaffUser = await prisma.user.create({
            data: {
                username: `test_staff_proxy_${suffix}`,
                passwordHash: hashPassword('staffPass123'),
                name: 'Test Staff Proxy',
                role: 'STAFF',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });

        testKioskUser = await prisma.user.create({
            data: {
                username: `test_kiosk_proxy_${suffix}`,
                passwordHash: hashPassword('kioskPass123'),
                name: 'Test Kiosk Proxy',
                role: 'KIOSK',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });

        testDisplayUser = await prisma.user.create({
            data: {
                username: `test_display_proxy_${suffix}`,
                passwordHash: hashPassword('displayPass123'),
                name: 'Test Display Proxy',
                role: 'DISPLAY',
                mfaEnabled: false,
            },
            select: { id: true, username: true },
        });
    });

    afterEach(async () => {
        const ids = [testAdminUser?.id, testStaffUser?.id, testKioskUser?.id, testDisplayUser?.id].filter(Boolean);
        if (ids.length) {
            await prisma.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
            await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
            await prisma.user.deleteMany({ where: { id: { in: ids } } });
        }
        process.env = { ...originalEnv };
    });

    // Helper: create a NextRequest with auth_token cookie
    function makeRequest(pathname: string, token?: string): NextRequest {
        const cookie = token ? `auth_token=${token}` : '';
        return new NextRequest(`http://localhost${pathname}`, {
            headers: {
                cookie,
            },
        });
    }

    // ================================================================
    // B1-PROXY-01: ADMIN + MFA enabled + password-only JWT → DENY
    // ================================================================
    it('B1-PROXY-01: ADMIN + MFA enabled + password-only JWT => DENY', async () => {
        // Enable MFA for admin
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        // Issue password-only JWT (no mfa claim)
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = makeRequest('/admin', token);
        const response = await proxy(request);

        // Should NOT pass through — either redirect to /login or clear cookie
        // For API routes it returns 403, for page routes it redirects
        // /admin is a page route, so it should redirect or clear cookie
        // The proxy clears the stale cookie and returns next() on /login path
        // For /admin, it should redirect to /login
        expect(response.status).toBe(307); // NextResponse.redirect returns 307
    });

    // ================================================================
    // B1-PROXY-02: ADMIN + MFA enabled + password-only JWT → DENY
    // ================================================================
    it('B1-PROXY-02: ADMIN + MFA enabled + password-only JWT (no mfa claim) => DENY', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        // Password-only JWT (no mfa claim) — MFA-enabled admin must not pass
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = makeRequest('/admin', token);
        const response = await proxy(request);

        expect(response.status).toBe(307); // redirect to /login
    });

    // ================================================================
    // B1-PROXY-03: ADMIN + MFA enabled + JWT mfa=true → ALLOW
    // ================================================================
    it('B1-PROXY-03: ADMIN + MFA enabled + JWT mfa=true => ALLOW', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        // JWT with mfa=true (MFA-assured session)
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        const request = makeRequest('/admin', token);
        const response = await proxy(request);

        // Should pass through — 200 means NextResponse.next()
        expect(response.status).toBe(200);
    });

    // ================================================================
    // B1-PROXY-04: ADMIN + MFA disabled + normal valid JWT → ALLOW
    // ================================================================
    it('B1-PROXY-04: ADMIN + MFA disabled + normal valid JWT => ALLOW', async () => {
        // MFA is disabled (default from beforeEach)
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = makeRequest('/admin', token);
        const response = await proxy(request);

        expect(response.status).toBe(200);
    });

    // ================================================================
    // B1-PROXY-05: STAFF + protected route → allowed per role policy
    // ================================================================
    it('B1-PROXY-05a: STAFF + /canbo (allowed role) => ALLOW', async () => {
        const token = await signJWT({ userId: testStaffUser.id, role: 'STAFF' });
        const request = makeRequest('/canbo', token);
        const response = await proxy(request);

        expect(response.status).toBe(200);
    });

    it('B1-PROXY-05b: STAFF + /admin (disallowed role) => DENY', async () => {
        const token = await signJWT({ userId: testStaffUser.id, role: 'STAFF' });
        const request = makeRequest('/admin', token);
        const response = await proxy(request);

        // STAFF cannot access /admin — should redirect to /canbo
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('/canbo');
    });

    it('B1-PROXY-05c: KIOSK + /kiosk (allowed role) => ALLOW', async () => {
        const token = await signJWT({ userId: testKioskUser.id, role: 'KIOSK' });
        const request = makeRequest('/kiosk', token);
        const response = await proxy(request);

        expect(response.status).toBe(200);
    });

    it('B1-PROXY-05d: DISPLAY + /display (allowed role) => ALLOW', async () => {
        const token = await signJWT({ userId: testDisplayUser.id, role: 'DISPLAY' });
        const request = makeRequest('/display', token);
        const response = await proxy(request);

        expect(response.status).toBe(200);
    });

    // ================================================================
    // B1-PROXY-06: STALE ADMIN JWT issued before MFA enable → DENY
    // ================================================================
    it('B1-PROXY-06: Stale ADMIN JWT issued before MFA enable => DENY', async () => {
        // Issue JWT while MFA is disabled
        const staleToken = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });

        // Now enable MFA
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        // Stale JWT should be rejected
        const request = makeRequest('/admin', staleToken);
        const response = await proxy(request);

        expect(response.status).toBe(307); // redirect to /login
    });

    // ================================================================
    // B1-PROXY-07: FORGED/TAMPERED JWT → DENY
    // ================================================================
    it('B1-PROXY-07: Forged/tampered JWT => DENY', async () => {
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN', mfa: true });
        const parts = token.split('.');
        const tampered = `${parts[0]}.${parts[1]}.tampered_signature`;

        const request = makeRequest('/admin', tampered);
        const response = await proxy(request);

        // Tampered JWT fails verifyJWT → returns next() with cleared cookie
        // For /admin, it should redirect to /login
        expect(response.status).toBe(307);
    });

    // ================================================================
    // B1-PROXY-08: MFA challenge token presented as auth token → DENY
    // ================================================================
    it('B1-PROXY-08: MFA challenge token as auth_token => DENY', async () => {
        // Create a challenge token (type='mfa_challenge')
        const { createMfaChallengeToken } = await import('@/lib/mfa-service');
        const challengeToken = await createMfaChallengeToken(testAdminUser.id, 'ADMIN');

        const request = makeRequest('/admin', challengeToken);
        const response = await proxy(request);

        // verifyJWT rejects type='mfa_challenge' tokens → should redirect
        expect(response.status).toBe(307);
    });

    // ================================================================
    // B1-PROXY-DB-FAIL: DB failure during MFA lookup → fail closed
    // ================================================================
    it('B1-PROXY-DB-FAIL: DB exception in enforceAdminMfa => fail closed (DENY)', async () => {
        // Enable MFA so the proxy will attempt a DB lookup
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });

        // Mock prisma.user.findUnique to throw
        const findUniqueSpy = vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Database connection lost'));

        try {
            const request = makeRequest('/admin', token);
            const response = await proxy(request);

            // enforceAdminMfa catches DB error and returns false → fail closed
            // For /admin (page route), should redirect to /login
            expect(response.status).toBe(307);
        } finally {
            findUniqueSpy.mockRestore();
        }
    });

    // ================================================================
    // B1-PROXY-DB-FAIL-API: DB failure on API route → 403 MFA_REQUIRED
    // ================================================================
    it('B1-PROXY-DB-FAIL-API: DB exception on API route => 403 MFA_REQUIRED', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });

        const findUniqueSpy = vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Database connection lost'));

        try {
            const request = makeRequest('/api/admin/mfa/status', token);
            const response = await proxy(request);

            // API routes get JSON error responses
            expect(response.status).toBe(403);
            const body = await response.json();
            expect(body.code).toBe('MFA_REQUIRED');
        } finally {
            findUniqueSpy.mockRestore();
        }
    });

    // ================================================================
    // PROXY-SETTINGS: /api/settings PUT requires ADMIN + MFA
    // ================================================================
    it('PROXY-SETTINGS-01: /api/settings GET is public (no auth needed)', async () => {
        const request = makeRequest('/api/settings');
        const response = await proxy(request);

        expect(response.status).toBe(200);
    });

    it('PROXY-SETTINGS-02: /api/settings PUT without token => 401', async () => {
        const request = new NextRequest('http://localhost/api/settings', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: 'test', value: 'test' }),
        });
        const response = await proxy(request);

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.code).toBe('UNAUTHORIZED');
    });

    it('PROXY-SETTINGS-03: /api/settings PUT with STAFF token => 403', async () => {
        const token = await signJWT({ userId: testStaffUser.id, role: 'STAFF' });
        const request = new NextRequest('http://localhost/api/settings', {
            method: 'PUT',
            headers: {
                cookie: `auth_token=${token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ key: 'test', value: 'test' }),
        });
        const response = await proxy(request);

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.code).toBe('FORBIDDEN');
    });

    it('PROXY-SETTINGS-04: /api/settings PUT with ADMIN + MFA enabled + no mfa claim => 403 MFA_REQUIRED', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = new NextRequest('http://localhost/api/settings', {
            method: 'PUT',
            headers: {
                cookie: `auth_token=${token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ key: 'test', value: 'test' }),
        });
        const response = await proxy(request);

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.code).toBe('MFA_REQUIRED');
    });

    // ================================================================
    // PROXY-THEMES: /api/themes PUT requires ADMIN + MFA
    // ================================================================
    it('PROXY-THEMES-01: /api/themes GET is public', async () => {
        const request = makeRequest('/api/themes');
        const response = await proxy(request);

        expect(response.status).toBe(200);
    });

    it('PROXY-THEMES-02: /api/themes PUT with ADMIN + MFA enabled + no mfa claim => 403 MFA_REQUIRED', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = new NextRequest('http://localhost/api/themes', {
            method: 'PUT',
            headers: {
                cookie: `auth_token=${token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ name: 'test', colors: {} }),
        });
        const response = await proxy(request);

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.code).toBe('MFA_REQUIRED');
    });

    // ================================================================
    // PROXY-LOGIN: /login redirect logic with MFA
    // ================================================================
    it('PROXY-LOGIN-01: /login with valid ADMIN token (MFA disabled) => redirect to /admin', async () => {
        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = makeRequest('/login', token);
        const response = await proxy(request);

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('/admin');
    });

    it('PROXY-LOGIN-02: /login with ADMIN token + MFA enabled + no mfa claim => clear cookie, stay on /login', async () => {
        const secret = generateTotpSecret();
        const { encryptedSecret, keyVersion } = encryptMfaSecret(secret);
        await prisma.user.update({
            where: { id: testAdminUser.id },
            data: { mfaEnabled: true, mfaSecret: encryptedSecret, mfaKeyVersion: keyVersion, mfaEnabledAt: new Date() },
        });

        const token = await signJWT({ userId: testAdminUser.id, role: 'ADMIN' });
        const request = makeRequest('/login', token);
        const response = await proxy(request);

        // Should stay on /login (200) and clear the stale cookie
        expect(response.status).toBe(200);
        const cookieHeader = response.headers.get('set-cookie') || '';
        expect(cookieHeader).toContain('auth_token=;'); // cleared
    });

    // ================================================================
    // DENY BY DEFAULT: unknown /api routes → 401
    // ================================================================
    it('DENY-BY-DEFAULT: unknown /api route without token => 401', async () => {
        const request = makeRequest('/api/unknown-route');
        const response = await proxy(request);

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.code).toBe('UNAUTHORIZED');
    });
});
