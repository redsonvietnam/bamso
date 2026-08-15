import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    default: {
        ticket: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/ticket-service', () => ({
    createTicket: vi.fn(),
}));

vi.mock('@/lib/sse-broker', () => ({
    broadcastQueueUpdate: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    RATE_LIMITS: {
        tickets: { windowMs: 60000, max: 100 },
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

import { POST } from '@/app/api/tickets/route';
import { createTicket } from '@/lib/ticket-service';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const mockedCreateTicket = createTicket as ReturnType<typeof vi.fn>;
const mockedBroadcastQueueUpdate = broadcastQueueUpdate as ReturnType<typeof vi.fn>;
const mockedCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockedGetClientIp = getClientIp as ReturnType<typeof vi.fn>;
const mockedLogger = logger as unknown as {
    error: ReturnType<typeof vi.fn>;
};

function makePostRequest(body: unknown) {
    return new Request('http://localhost/api/tickets', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockedGetClientIp.mockReturnValue('127.0.0.1');
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
    mockedCreateTicket.mockResolvedValue({
        id: 'ticket-1',
        serviceId: 'svc-1',
        ticketNumber: 'A001',
    });
    mockedBroadcastQueueUpdate.mockResolvedValue(undefined);
});

describe('POST /api/tickets', () => {
    it('returns 400 for malformed JSON', async () => {
        const response = await POST(new Request('http://localhost/api/tickets', {
            method: 'POST',
            body: '{invalid',
            headers: { 'Content-Type': 'application/json' },
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_JSON' });
    });

    it('returns 400 for non-object JSON body', async () => {
        const response = await POST(makePostRequest(['ticket']));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_BODY' });
    });

    it.each([
        ['missing', {}],
        ['null', { serviceId: null }],
        ['number', { serviceId: 123 }],
        ['boolean', { serviceId: true }],
        ['object', { serviceId: { id: 'svc-1' } }],
        ['array', { serviceId: ['svc-1'] }],
        ['empty string', { serviceId: '' }],
        ['whitespace', { serviceId: '   ' }],
    ])('returns 400 for invalid serviceId: %s', async (_label, body) => {
        const response = await POST(makePostRequest(body));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_FIELDS' });
        expect(mockedCreateTicket).not.toHaveBeenCalled();
    });

    it('returns 201 even when queue broadcast rejects', async () => {
        mockedBroadcastQueueUpdate.mockRejectedValue(new Error('SSE down'));

        const response = await POST(makePostRequest({ serviceId: 'svc-1' }));
        await Promise.resolve();

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({ id: 'ticket-1' });
        expect(mockedBroadcastQueueUpdate).toHaveBeenCalledWith('svc-1');
        expect(mockedLogger.error).toHaveBeenCalledWith('Ticket queue broadcast failed:', expect.any(Error));
    });

    it('does not wait for a never-resolving queue broadcast before responding', async () => {
        mockedBroadcastQueueUpdate.mockReturnValue(new Promise(() => {}));

        const response = await Promise.race([
            POST(makePostRequest({ serviceId: 'svc-1' })),
            new Promise((_, reject) => setTimeout(() => reject(new Error('POST timed out')), 50)),
        ]);

        expect(response).toBeInstanceOf(Response);
        expect((response as Response).status).toBe(201);
    });
});
