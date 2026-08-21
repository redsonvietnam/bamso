import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
    signJWT: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    RATE_LIMITS: {
        demoToken: { windowMs: 60000, max: 10 },
    },
}));

vi.mock('@/lib/cookie', () => ({
    isSecureCookie: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), log: vi.fn() },
}));

import { GET } from '@/app/api/demo-token/route';
import { signJWT } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isSecureCookie } from '@/lib/cookie';

const mockedSignJWT = signJWT as unknown as ReturnType<typeof vi.fn>;
const mockedCheckRateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;
const mockedGetClientIp = getClientIp as unknown as ReturnType<typeof vi.fn>;
const mockedIsSecureCookie = isSecureCookie as unknown as ReturnType<typeof vi.fn>;

const originalEnv = process.env.DEMO_MODE_ENABLED;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_MODE_ENABLED = 'true';
    mockedGetClientIp.mockReturnValue('127.0.0.1');
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
    mockedSignJWT.mockResolvedValue('mock-token');
    mockedIsSecureCookie.mockReturnValue(false);
});

afterEach(() => {
    if (originalEnv === undefined) {
        delete process.env.DEMO_MODE_ENABLED;
    } else {
        process.env.DEMO_MODE_ENABLED = originalEnv;
    }
});

function makeRequest(url: string) {
    return new Request(`http://localhost${url}`);
}

describe('GET /api/demo-token', () => {
    describe('feature gate', () => {
        it('rejects when DEMO_MODE_ENABLED is not true', async () => {
            process.env.DEMO_MODE_ENABLED = 'false';
            const res = await GET(makeRequest('/api/demo-token?role=STAFF'));
            expect(res.status).toBe(403);
        });

        it('rejects when DEMO_MODE_ENABLED is unset', async () => {
            delete process.env.DEMO_MODE_ENABLED;
            const res = await GET(makeRequest('/api/demo-token?role=STAFF'));
            expect(res.status).toBe(403);
        });
    });

    describe('allowed roles', () => {
        it('generates STAFF token', async () => {
            const res = await GET(makeRequest('/api/demo-token?role=STAFF'));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.token).toBe('mock-token');
            expect(data.role).toBe('STAFF');
            expect(mockedSignJWT).toHaveBeenCalledWith({ userId: 'demo-staff', role: 'STAFF' });
        });

        it('generates DISPLAY token', async () => {
            const res = await GET(makeRequest('/api/demo-token?role=DISPLAY'));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.role).toBe('DISPLAY');
            expect(mockedSignJWT).toHaveBeenCalledWith({ userId: 'demo-display', role: 'DISPLAY' });
        });

        it('generates ADMIN token', async () => {
            const res = await GET(makeRequest('/api/demo-token?role=ADMIN'));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.role).toBe('ADMIN');
            expect(mockedSignJWT).toHaveBeenCalledWith({ userId: 'demo-admin', role: 'ADMIN' });
        });

        it('generates KIOSK token', async () => {
            const res = await GET(makeRequest('/api/demo-token?role=KIOSK'));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.role).toBe('KIOSK');
            expect(mockedSignJWT).toHaveBeenCalledWith({ userId: 'demo-kiosk', role: 'KIOSK' });
        });
    });

    describe('rejected roles', () => {
        it('falls back to STAFF for non-allowed role', async () => {
            const res = await GET(makeRequest('/api/demo-token?role=SUPERADMIN'));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.role).toBe('STAFF');
            expect(mockedSignJWT).toHaveBeenCalledWith({ userId: 'demo-staff', role: 'STAFF' });
        });

        it('defaults to STAFF when no role specified', async () => {
            const res = await GET(makeRequest('/api/demo-token'));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.role).toBe('STAFF');
        });
    });

    describe('cookie behavior', () => {
        it('sets auth_token cookie with the generated token', async () => {
            const res = await GET(makeRequest('/api/demo-token?role=ADMIN'));
            expect(res.status).toBe(200);
            const setCookie = res.headers.get('set-cookie');
            expect(setCookie).toContain('auth_token=');
            expect(setCookie).toContain('mock-token');
        });
    });

    describe('rate limiting', () => {
        it('rejects when rate limit exceeded', async () => {
            mockedCheckRateLimit.mockResolvedValue({ allowed: false });
            const res = await GET(makeRequest('/api/demo-token?role=STAFF'));
            expect(res.status).toBe(429);
        });
    });
});
