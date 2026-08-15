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
