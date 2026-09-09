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
        if (!response) throw new Error('Expected route handler to return a response');

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_JSON' });
    });

    it.each(routes)('%s rejects non-object JSON with HTTP 400', async (_name, handler, method) => {
        const response = await handler(request(method, JSON.stringify(['ticket'])));
        if (!response) throw new Error('Expected route handler to return a response');

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

        // Mock setImmediate to execute callbacks synchronously in tests
        const originalSetImmediate = global.setImmediate;
        const flushSetImmediate = (fn: () => void) => fn();
        global.setImmediate = flushSetImmediate as unknown as typeof setImmediate;

        try {
            const response = await callNext(
                request('POST', JSON.stringify({ serviceId: 'service-1', pos: 'Q1' }))
            );
            if (!response) throw new Error('expected a response');

            expect(response.status).toBe(200);
            expect(mockedCallNextTicket).toHaveBeenCalledWith('service-1', 'Q1');
            expect(mockedBroadcastQueueUpdate).toHaveBeenCalledWith('service-1');
            expect(mockedBroadcastDisplayCall).toHaveBeenCalledWith('A001', 'Q1', 'Nguyễn Văn A', undefined);
        } finally {
            global.setImmediate = originalSetImmediate;
        }
    });

    it('returns HTTP response before notification completes (non-blocking)', async () => {
        const ticket = {
            id: 't1',
            ticketNumber: 'A001',
            serviceId: 'service-1',
            customerName: 'Test User',
        };
        mockedCallNextTicket.mockResolvedValue(ticket);
        mockedFindFirst.mockResolvedValue(null);

        // Controllable broadcast promises — we decide when they resolve
        let resolveQueueBroadcast!: () => void;
        let resolveDisplayBroadcast!: () => void;
        const broadcastStarted = { queue: false, display: false };

        mockedBroadcastQueueUpdate.mockImplementation(() => {
            broadcastStarted.queue = true;
            return new Promise<void>((resolve) => { resolveQueueBroadcast = resolve; });
        });

        mockedBroadcastDisplayCall.mockImplementation(() => {
            broadcastStarted.display = true;
            return new Promise<void>((resolve) => { resolveDisplayBroadcast = resolve; });
        });

        // Capture setImmediate callback WITHOUT executing it
        let capturedCallback: (() => void) | null = null;
        const originalSetImmediate = global.setImmediate;
        global.setImmediate = ((cb: () => void) => {
            capturedCallback = cb;
            return 0 as unknown as NodeJS.Immediate;
        }) as unknown as typeof setImmediate;

        try {
            // Act: invoke route handler
            const response = await callNext(
                request('POST', JSON.stringify({ serviceId: 'service-1', pos: 'Q1' }))
            );
            if (!response) throw new Error('expected a response');

            // ASSERTION 1: HTTP response returned successfully
            expect(response.status).toBe(200);
            expect(mockedCallNextTicket).toHaveBeenCalledWith('service-1', 'Q1');

            // ASSERTION 2: setImmediate callback captured but NOT executed yet
            expect(capturedCallback).not.toBeNull();

            // ASSERTION 3: Notification has NOT started — broadcasts not called
            expect(broadcastStarted.queue).toBe(false);
            expect(broadcastStarted.display).toBe(false);

            // Act: execute captured callback (simulating Node event loop scheduling)
            capturedCallback!();

            // Flush microtasks: findFirst resolves → broadcasts called
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            // ASSERTION 4: Broadcasts started but NOT completed (promises pending)
            expect(broadcastStarted.queue).toBe(true);
            expect(broadcastStarted.display).toBe(true);

            // Act: resolve broadcasts to complete notification
            resolveQueueBroadcast();
            resolveDisplayBroadcast();
        } finally {
            global.setImmediate = originalSetImmediate;
        }
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
