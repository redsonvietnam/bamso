import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    evalMock: vi.fn(),
    errorMock: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
    default: {
        eval: mocks.evalMock,
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: mocks.errorMock,
    },
}));

import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const config = { windowMs: 60_000, maxRequests: 3 } as const;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RATE_LIMIT_DISABLED', 'false');
});

describe('checkRateLimit', () => {
    it('uses one atomic Redis eval for a request', async () => {
        mocks.evalMock.mockResolvedValue([1, 2]);

        await expect(checkRateLimit('auth:127.0.0.1', config)).resolves.toEqual({
            allowed: true,
            remaining: 2,
        });

        expect(mocks.evalMock).toHaveBeenCalledTimes(1);
        expect(mocks.evalMock.mock.calls[0][1]).toBe(1);
        expect(mocks.evalMock.mock.calls[0][2]).toBe('ratelimit:auth:127.0.0.1');
        expect(mocks.evalMock.mock.calls[0][3]).toBe('60000');
        expect(mocks.evalMock.mock.calls[0][4]).toBe('3');
    });

    it('denies the request when Redis reports the limit is exceeded', async () => {
        mocks.evalMock.mockResolvedValue([0, 0]);

        await expect(checkRateLimit('tickets:127.0.0.1', config)).resolves.toEqual({
            allowed: false,
            remaining: 0,
        });
    });

    it('does not honor RATE_LIMIT_DISABLED in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('RATE_LIMIT_DISABLED', 'true');
        mocks.evalMock.mockResolvedValue([0, 0]);

        await expect(checkRateLimit('auth:127.0.0.1', config)).resolves.toEqual({
            allowed: false,
            remaining: 0,
        });
        expect(mocks.evalMock).toHaveBeenCalledTimes(1);
    });

    it('honors RATE_LIMIT_DISABLED outside production', async () => {
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('RATE_LIMIT_DISABLED', 'true');

        await expect(checkRateLimit('auth:127.0.0.1', config)).resolves.toEqual({
            allowed: true,
            remaining: 3,
        });
        expect(mocks.evalMock).not.toHaveBeenCalled();
    });

    it('fails open when Redis is unavailable', async () => {
        mocks.evalMock.mockRejectedValue(new Error('redis unavailable'));

        await expect(checkRateLimit('auth:127.0.0.1', config)).resolves.toEqual({
            allowed: true,
            remaining: 0,
        });
        expect(mocks.errorMock).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid rate limit configuration by failing open', async () => {
        await expect(checkRateLimit('auth:127.0.0.1', { windowMs: 0, maxRequests: 3 })).resolves.toEqual({
            allowed: true,
            remaining: 0,
        });
        expect(mocks.errorMock).toHaveBeenCalledTimes(1);
        expect(mocks.evalMock).not.toHaveBeenCalled();
    });
});

describe('getClientIp', () => {
    it('uses the first address from x-forwarded-for', () => {
        const request = new Request('http://localhost', {
            headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
        });

        expect(getClientIp(request)).toBe('203.0.113.10');
    });

    it('falls back to x-real-ip and then unknown', () => {
        expect(getClientIp(new Request('http://localhost', {
            headers: { 'x-real-ip': '203.0.113.20' },
        }))).toBe('203.0.113.20');

        expect(getClientIp(new Request('http://localhost'))).toBe('unknown');
    });
});
