import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/tickets/route';
import { createTicket } from '@/lib/ticket-service';
import { broadcastQueueUpdate } from '@/lib/sse-broker';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { authenticateOptional } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

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

const mockedCreateTicket = createTicket as ReturnType<typeof vi.fn>;
const mockedBroadcastQueueUpdate = broadcastQueueUpdate as ReturnType<typeof vi.fn>;
const mockedCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;
const mockedGetClientIp = getClientIp as ReturnType<typeof vi.fn>;
const mockedAuthenticateOptional = authenticateOptional as ReturnType<typeof vi.fn>;
const mockedLogger = logger as unknown as {
    error: ReturnType<typeof vi.fn>;
};

const mockTickets = [
    { id: 't1', serviceId: 'svc-1', ticketNumber: 'A001', dayKey: '2026-08-21', status: 'CALLED', customerName: 'Nguyễn Văn A', phone: '0909999999', position: 1, missCount: 0, pos: null, createdAt: new Date(), calledAt: new Date(), completedAt: null, service: { id: 'svc-1', name: 'Service 1' } },
    { id: 't2', serviceId: 'svc-1', ticketNumber: 'A002', dayKey: '2026-08-21', status: 'IN_PROGRESS', customerName: 'Trần Thị B', phone: '0911888888', position: 2, missCount: 0, pos: null, createdAt: new Date(), calledAt: new Date(), completedAt: null, service: { id: 'svc-1', name: 'Service 1' } },
    { id: 't3', serviceId: 'svc-1', ticketNumber: 'A003', dayKey: '2026-08-21', status: 'PENDING', customerName: 'Lê Văn C', phone: '0922777777', position: 3, missCount: 0, pos: null, createdAt: new Date(), calledAt: null, completedAt: null, service: { id: 'svc-1', name: 'Service 1' } },
    { id: 't4', serviceId: 'svc-1', ticketNumber: 'A004', dayKey: '2026-08-21', status: 'COMPLETED', customerName: 'Phạm Văn D', phone: '0933666666', position: 4, missCount: 0, pos: null, createdAt: new Date(), calledAt: new Date(), completedAt: new Date(), service: { id: 'svc-1', name: 'Service 1' } },
    { id: 't5', serviceId: 'svc-1', ticketNumber: 'A005', dayKey: '2026-08-21', status: 'MISSED', customerName: 'Hoàng Văn E', phone: '0944555555', position: 5, missCount: 0, pos: null, createdAt: new Date(), calledAt: new Date(), completedAt: null, service: { id: 'svc-1', name: 'Service 1' } },
];

function makePostRequest(body: unknown) {
    return new Request('http://localhost/api/tickets', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeGetTicketsRequest(params: { serviceId?: string; status?: string } = {}) {
    return new Request(`http://localhost/api/tickets?serviceId=${params.serviceId ?? ''}&status=${params.status ?? ''}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeStaffGetTicketsRequest() {
    return new Request('http://localhost/api/tickets', {
        method: 'GET',
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

describe('GET /api/tickets — PII redaction', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { default: prismaMock } = await import('@/lib/db');
        vi.mocked(prismaMock.ticket.findMany).mockResolvedValue(mockTickets);
        mockedAuthenticateOptional.mockResolvedValue({ role: null });
    });

    it('anonymous: CALLED ticket exposes customerName', async () => {
        const response = await GET(makeGetTicketsRequest({}));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[0].customerName).toBe('Nguyễn Văn A');
    });

    it('anonymous: IN_PROGRESS ticket exposes customerName', async () => {
        const response = await GET(makeGetTicketsRequest({}));
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[1].customerName).toBe('Trần Thị B');
    });

    it('anonymous: PENDING ticket hides customerName', async () => {
        const response = await GET(makeGetTicketsRequest({}));
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[2].customerName).toBeUndefined();
    });

    it('anonymous: COMPLETED ticket hides customerName', async () => {
        const response = await GET(makeGetTicketsRequest({}));
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[3].customerName).toBeUndefined();
    });

    it('anonymous: MISSED ticket hides customerName', async () => {
        const response = await GET(makeGetTicketsRequest({}));
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[4].customerName).toBeUndefined();
    });

    it('anonymous: phone is NEVER exposed', async () => {
        const response = await GET(makeGetTicketsRequest({}));
        const data = await response.json();
        for (const ticket of data) {
            expect(ticket.phone).toBeUndefined();
        }
    });

    it('STAFF: receives full data with customerName and phone', async () => {
        mockedAuthenticateOptional.mockResolvedValue({ role: 'STAFF' });
        const response = await GET(makeStaffGetTicketsRequest());
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[0].customerName).toBe('Nguyễn Văn A');
        expect(data[0].phone).toBe('0909999999');
        expect(data[2].customerName).toBe('Lê Văn C');
        expect(data[2].phone).toBe('0922777777');
    });

    it('ADMIN: receives full data with customerName and phone', async () => {
        mockedAuthenticateOptional.mockResolvedValue({ role: 'ADMIN' });
        const response = await GET(makeStaffGetTicketsRequest());
        const data = await response.json();
        expect(data).toHaveLength(5);
        expect(data[3].customerName).toBe('Phạm Văn D');
        expect(data[3].phone).toBe('0933666666');
    });
});
