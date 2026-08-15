import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn().mockResolvedValue({ role: 'STAFF' }),
}));

vi.mock('@/lib/queue-service', () => ({
    callNextTicket: vi.fn(),
    restoreTicket: vi.fn(),
    skipTicket: vi.fn(),
    completeTicket: vi.fn(),
}));

vi.mock('@/lib/sse-broker', () => ({
    broadcastQueueUpdate: vi.fn(),
    broadcastDisplayCall: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    default: {
        ticket: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
    },
}));

import { POST as callNext } from '@/app/api/queue/call-next/route';
import { PUT as restore } from '@/app/api/queue/restore/route';
import { PUT as skip } from '@/app/api/queue/skip/route';
import { PUT as complete } from '@/app/api/queue/complete/route';

import { callNextTicket } from '@/lib/queue-service';
import { broadcastQueueUpdate, broadcastDisplayCall } from '@/lib/sse-broker';
import prisma from '@/lib/db';

const mockedCallNextTicket = callNextTicket as unknown as ReturnType<typeof vi.fn>;
const mockedBroadcastQueueUpdate = broadcastQueueUpdate as unknown as ReturnType<typeof vi.fn>;
const mockedBroadcastDisplayCall = broadcastDisplayCall as unknown as ReturnType<typeof vi.fn>;
const mockedFindFirst = prisma.ticket.findFirst as unknown as ReturnType<typeof vi.fn>;

const routes = [
    ['call-next', callNext, 'POST'],
    ['restore', restore, 'PUT'],
    ['skip', skip, 'PUT'],
    ['complete', complete, 'PUT'],
] as const;

function request(method: string, body: string) {
    return new Request('http://localhost/api/queue', {
        method,
        body,
        headers: { 'content-type': 'application/json' },
    });
}

beforeEach(() => vi.clearAllMocks());

describe('queue mutation route validation', () => {
    it.each(routes)('%s rejects malformed JSON with HTTP 400', async (_name, handler, method) => {
        const response = await handler(request(method, '{invalid'));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_JSON' });
    });

    it.each(routes)('%s rejects non-object JSON with HTTP 400', async (_name, handler, method) => {
        const response = await handler(request(method, JSON.stringify(['ticket'])));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_BODY' });
    });
});

describe('call-next route pos contract', () => {
    it('calls the next ticket with pos as string on a valid request', async () => {
        const ticket = {
            id: 't1',
            ticketNumber: 'A001',
            serviceId: 'service-1',
            customerName: 'Nguyễn Văn A',
        };
        mockedCallNextTicket.mockResolvedValue(ticket);
        mockedFindFirst.mockResolvedValue(null);

        const response = await callNext(
            request('POST', JSON.stringify({ serviceId: 'service-1', pos: 'Q1' }))
        );
        if (!response) throw new Error('expected a response');

        expect(response.status).toBe(200);
        expect(mockedCallNextTicket).toHaveBeenCalledWith('service-1', 'Q1');
        expect(mockedBroadcastQueueUpdate).toHaveBeenCalledWith('service-1');
        expect(mockedBroadcastDisplayCall).toHaveBeenCalledWith('A001', 'Q1', 'Nguyễn Văn A', undefined);
    });

    it('rejects a request without pos with HTTP 400', async () => {
        const response = await callNext(request('POST', JSON.stringify({ serviceId: 'service-1' })));
        if (!response) throw new Error('expected a response');

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_FIELDS' });
        expect(mockedCallNextTicket).not.toHaveBeenCalled();
    });

    it('rejects an empty string pos with HTTP 400', async () => {
        const response = await callNext(
            request('POST', JSON.stringify({ serviceId: 'service-1', pos: '' }))
        );
        if (!response) throw new Error('expected a response');

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_FIELDS' });
        expect(mockedCallNextTicket).not.toHaveBeenCalled();
    });

    it('rejects a whitespace pos with HTTP 400', async () => {
        const response = await callNext(
            request('POST', JSON.stringify({ serviceId: 'service-1', pos: '   ' }))
        );
        if (!response) throw new Error('expected a response');

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_FIELDS' });
        expect(mockedCallNextTicket).not.toHaveBeenCalled();
    });

    it('rejects a non-string pos with HTTP 400', async () => {
        const response = await callNext(
            request('POST', JSON.stringify({ serviceId: 'service-1', pos: 1 }))
        );
        if (!response) throw new Error('expected a response');

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_FIELDS' });
        expect(mockedCallNextTicket).not.toHaveBeenCalled();
    });
});
