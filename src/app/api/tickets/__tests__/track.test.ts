import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    default: {
        ticket: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    RATE_LIMITS: {
        track: { windowMs: 60_000, maxRequests: 100 },
    },
}));

vi.mock('@/lib/api-auth', () => ({
    authenticateOptional: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        debug: vi.fn(),
    },
}));

import { GET } from '@/app/api/tickets/track/route';
import prisma from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { authenticateOptional } from '@/lib/api-auth';

const mockedFindFirst = prisma.ticket.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockedCheckRateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;
const mockedGetClientIp = getClientIp as unknown as ReturnType<typeof vi.fn>;
const mockedAuthenticateOptional = authenticateOptional as unknown as ReturnType<typeof vi.fn>;

const fullTicket = {
    id: 'ticket-uuid-1',
    ticketNumber: 'A001',
    dayKey: '2026-08-20',
    serviceId: 'svc-1',
    customerName: 'Nguyen Van A',
    phone: '0901234567',
    status: 'PENDING',
    position: 1,
    missCount: 0,
    pos: null,
    createdAt: new Date(),
    calledAt: null,
    completedAt: null,
    service: { id: 'svc-1', name: 'Dich vu A', code: 'A', color: '#ff0000', prefix: 'A' },
};

function makeGetRequest(query: string) {
    return new Request(`http://localhost/api/tickets/track?query=${encodeURIComponent(query)}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    mockedGetClientIp.mockReturnValue('127.0.0.1');
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
    mockedAuthenticateOptional.mockResolvedValue(null);
    mockedFindFirst.mockResolvedValue(fullTicket);
});

describe('GET /api/tickets/track', () => {
    it('returns 400 when query param is missing', async () => {
        const response = await GET(new Request('http://localhost/api/tickets/track'));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'MISSING_QUERY_PARAM' });
        expect(mockedFindFirst).not.toHaveBeenCalled();
    });

    it('returns 429 when rate limit is exceeded', async () => {
        mockedCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

        const response = await GET(makeGetRequest('A001'));

        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({ code: 'RATE_LIMITED' });
        expect(mockedFindFirst).not.toHaveBeenCalled();
    });

    it('returns 404 when ticket is not found', async () => {
        mockedFindFirst.mockResolvedValue(null);

        const response = await GET(makeGetRequest('X999'));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({ code: 'TICKET_NOT_FOUND' });
    });

    it('returns full ticket with PII for authenticated staff', async () => {
        mockedAuthenticateOptional.mockResolvedValue({ userId: 'user-1', role: 'STAFF' });

        const response = await GET(makeGetRequest('A001'));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.customerName).toBe('Nguyen Van A');
        expect(body.phone).toBe('0901234567');
        expect(body.ticketNumber).toBe('A001');
    });

    it('returns full ticket with PII for authenticated admin', async () => {
        mockedAuthenticateOptional.mockResolvedValue({ userId: 'user-1', role: 'ADMIN' });

        const response = await GET(makeGetRequest('A001'));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.customerName).toBe('Nguyen Van A');
        expect(body.phone).toBe('0901234567');
    });

    it('redacts customerName and phone for anonymous callers', async () => {
        mockedAuthenticateOptional.mockResolvedValue(null);

        const response = await GET(makeGetRequest('A001'));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.customerName).toBeUndefined();
        expect(body.phone).toBeUndefined();
        expect(body.ticketNumber).toBe('A001');
        expect(body.service).toEqual(fullTicket.service);
    });

    it('redacts PII for non-staff roles', async () => {
        mockedAuthenticateOptional.mockResolvedValue({ userId: 'user-1', role: 'KIOSK' });

        const response = await GET(makeGetRequest('A001'));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.customerName).toBeUndefined();
        expect(body.phone).toBeUndefined();
    });

    it('includes service relation in response', async () => {
        const response = await GET(makeGetRequest('A001'));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.service).toEqual(fullTicket.service);
    });

    it('uses rate limit with correct key', async () => {
        mockedGetClientIp.mockReturnValue('192.168.1.100');

        await GET(makeGetRequest('A001'));

        expect(mockedCheckRateLimit).toHaveBeenCalledWith('track:192.168.1.100', expect.objectContaining({ windowMs: 60_000, maxRequests: 100 }));
    });
});
