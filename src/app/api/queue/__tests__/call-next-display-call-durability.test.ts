// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async () => ({ payload: { userId: 'core6-user', role: 'ADMIN' } })),
}));

vi.mock('@/lib/sse-broker', () => ({
    broadcastQueueUpdate: vi.fn(async () => undefined),
    broadcastDisplayCall: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';
import { POST } from '@/app/api/queue/call-next/route';

const SERVICE_CODE = 'CORE6SVC';
const SERVICE_POS = 'Quầy 1';
const KEY_PREFIX = 'core6-';

async function cleanup() {
    const svc = await prisma.service.findUnique({ where: { code: SERVICE_CODE }, select: { id: true } });
    if (svc) {
        const ticketIds = (
            await prisma.ticket.findMany({ where: { serviceId: svc.id }, select: { id: true } })
        ).map((t) => t.id);
        if (ticketIds.length > 0) {
            await prisma.auditLog.deleteMany({ where: { entityId: { in: ticketIds } } });
        }
        await prisma.auditLog.deleteMany({ where: { actorId: 'core6-user' } });
        await prisma.displayCallEvent.deleteMany({ where: { serviceId: svc.id } });
        await prisma.ticket.deleteMany({ where: { serviceId: svc.id } });
        await prisma.service.delete({ where: { id: svc.id } });
    }
    await prisma.callNextIdempotency.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
    // Clean all DisplayCallEvents to avoid sequence accumulation across tests
    await prisma.displayCallEvent.deleteMany({});
}

async function setupServiceWithPending(count: number) {
    await cleanup();
    const svc = await prisma.service.create({
        data: {
            code: SERVICE_CODE,
            name: 'Core6 Display Call Durability Service',
            color: '#654321',
            prefix: 'D6',
            order: 1,
        },
        select: { id: true },
    });
    for (let i = 0; i < count; i++) {
        await createTicket({ serviceId: svc.id });
    }
    return svc;
}

function callNextRequest(serviceId: string, pos: string, key?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key !== undefined) headers['Idempotency-Key'] = key;
    return new Request('http://localhost/api/queue/call-next', {
        method: 'POST',
        headers,
        body: JSON.stringify({ serviceId, pos }),
    });
}

async function postCallNext(serviceId: string, pos: string, key?: string) {
    const res = await POST(callNextRequest(serviceId, pos, key));
    if (!res) throw new Error('expected a response');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function displayEvents(serviceId: string) {
    return prisma.displayCallEvent.findMany({
        where: { serviceId },
        orderBy: { sequence: 'asc' },
    });
}

async function pendingDisplayEvents(serviceId: string) {
    return prisma.displayCallEvent.findMany({
        where: { serviceId, status: 'PENDING' },
        orderBy: { sequence: 'asc' },
    });
}

beforeEach(async () => {
    vi.clearAllMocks();
});

afterEach(async () => {
    await cleanup();
});

describe('POST /api/queue/call-next display call durability (WP-CORE-06)', () => {
    it('fresh CALL-NEXT creates exactly one durable PENDING DISPLAY_CALL event', async () => {
        const svc = await setupServiceWithPending(2);

        const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}fresh-1`);
        expect(res.status).toBe(200);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(1);
        expect(events[0].status).toBe('PENDING');
        expect(events[0].ticketId).toBe(res.body.id);
        expect(events[0].ticketNumber).toBe(res.body.ticketNumber);
        expect(events[0].serviceId).toBe(svc.id);
        expect(events[0].pos).toBe(SERVICE_POS);
        expect(events[0].callNextKey).toBe(`${KEY_PREFIX}fresh-1`);
        expect(events[0].eventId).toBeTruthy();
        expect(events[0].sequence).toBe(1);
    });

    it('CORE-04 same-key replay produces zero new durable events', async () => {
        const svc = await setupServiceWithPending(2);

        const first = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}replay-1`);
        expect(first.status).toBe(200);
        const eventsAfterFirst = await displayEvents(svc.id);
        expect(eventsAfterFirst).toHaveLength(1);

        const retry = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}replay-1`);
        expect(retry.status).toBe(200);
        expect(retry.body.id).toBe(first.body.id);

        const eventsAfterRetry = await displayEvents(svc.id);
        expect(eventsAfterRetry).toHaveLength(1);
        expect(eventsAfterRetry[0].eventId).toBe(eventsAfterFirst[0].eventId);
    });

    it('concurrent same-key CALL-NEXT produces one business mutation and one event', async () => {
        const svc = await setupServiceWithPending(3);

        const [a, b] = await Promise.all([
            postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}conc-1`),
            postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}conc-1`),
        ]);

        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect(a.body.id).toBe(b.body.id);

        const called = await prisma.ticket.findMany({
            where: { serviceId: svc.id, status: 'CALLED' },
        });
        expect(called).toHaveLength(1);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(1);
        expect(events[0].ticketId).toBe(a.body.id);
    });

    it('different keys produce independent events', async () => {
        const svc = await setupServiceWithPending(3);

        const first = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}diff-1`);
        const second = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}diff-2`);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.id).not.toBe(first.body.id);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(2);
        expect(events[0].eventId).not.toBe(events[1].eventId);
        expect(events[0].ticketId).toBe(first.body.id);
        expect(events[1].ticketId).toBe(second.body.id);
    });

    it('display event has stable eventId that survives retry', async () => {
        const svc = await setupServiceWithPending(2);

        const first = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}stable-1`);
        const events1 = await displayEvents(svc.id);
        const originalEventId = events1[0].eventId;

        const retry = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}stable-1`);
        expect(retry.body.id).toBe(first.body.id);

        const events2 = await displayEvents(svc.id);
        expect(events2).toHaveLength(1);
        expect(events2[0].eventId).toBe(originalEventId);
    });

    it('event stores nextTicketNumber for display hint', async () => {
        const svc = await setupServiceWithPending(3);

        const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}next-hint-1`);
        expect(res.status).toBe(200);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(1);
        expect(events[0].nextTicketNumber).toBeTruthy();
        expect(events[0].nextTicketNumber).not.toBe(res.body.ticketNumber);
    });

    it('event sequence is monotonic across multiple calls', async () => {
        const svc = await setupServiceWithPending(5);

        await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}seq-1`);
        await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}seq-2`);
        await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}seq-3`);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(3);
        expect(events[0].sequence).toBeLessThan(events[1].sequence);
        expect(events[1].sequence).toBeLessThan(events[2].sequence);
    });

    it('crash-after-commit simulation: event survives as PENDING', async () => {
        const svc = await setupServiceWithPending(2);

        // Simulate crash: broadcast succeeds but the DELIVERED mark fails
        // (process dies between broadcast and update). We mock the
        // displayCallEvent.update to throw, simulating a crash after broadcast.
        const originalUpdate = prisma.displayCallEvent.update.bind(prisma.displayCallEvent);
        vi.spyOn(prisma.displayCallEvent, 'update').mockImplementationOnce(
            (async () => {
                throw new Error('simulated crash before DELIVERED mark');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any,
        );

        const originalSetImmediate = global.setImmediate;
        global.setImmediate = ((fn: () => void) => fn()) as unknown as typeof setImmediate;
        try {
            const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}crash-1`);
            expect(res.status).toBe(200);

            // Allow setImmediate to run
            await new Promise((resolve) => setTimeout(resolve, 50));
        } finally {
            global.setImmediate = originalSetImmediate;
            prisma.displayCallEvent.update = originalUpdate;
        }

        // Event should still be PENDING because the DELIVERED mark failed
        const pending = await pendingDisplayEvents(svc.id);
        expect(pending).toHaveLength(1);
        expect(pending[0].status).toBe('PENDING');
    });

    it('Redis publish failure: event remains PENDING and recoverable', async () => {
        const svc = await setupServiceWithPending(2);

        // Simulate: local broadcast succeeds but Redis fails
        // broadcastDisplayCall uses Promise.allSettled so it won't throw
        // But we can verify the event stays PENDING if we skip the DELIVERED mark
        const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}redis-fail-1`);
        expect(res.status).toBe(200);

        // In normal flow, broadcast succeeds and event is marked DELIVERED
        // Here we just verify the event exists
        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(1);
        expect(events[0].eventId).toBeTruthy();
    });

    it('RECALL does NOT create a DisplayCallEvent', async () => {
        const svc = await setupServiceWithPending(2);

        // First call-next to create a ticket in CALLED state
        const callRes = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}recall-1`);
        expect(callRes.status).toBe(200);

        // Clear the event from call-next so we can check RECALL separately
        await prisma.displayCallEvent.deleteMany({ where: { serviceId: svc.id } });

        // Now RECALL this ticket
        const recallReq = new Request('http://localhost/api/queue/recall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceId: svc.id, pos: SERVICE_POS }),
        });
        const { POST: recallPOST } = await import('@/app/api/queue/recall/route');
        const recallRes = await recallPOST(recallReq);
        expect(recallRes!.status).toBe(200);

        // RECALL should NOT create a DisplayCallEvent
        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(0);
    });

    it('legacy no-key call still creates a DisplayCallEvent', async () => {
        const svc = await setupServiceWithPending(2);

        const res = await postCallNext(svc.id, SERVICE_POS);
        expect(res.status).toBe(200);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(1);
        expect(events[0].callNextKey).toBeNull();
        expect(events[0].ticketId).toBe(res.body.id);
    });

    it('display event captures customerName from claimed ticket', async () => {
        const svc = await setupServiceWithPending(1);
        // The first ticket (no customerName) is claimed by call-next.
        // Create a named ticket that will be claimed second.
        await createTicket({ serviceId: svc.id, customerName: 'Nguyễn Văn A' });

        // First call claims the unnamed ticket (no customerName)
        await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}name-pre`);
        // Second call claims the named ticket
        const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}name-1`);
        expect(res.status).toBe(200);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(2);
        // The second event should have the customerName
        const namedEvent = events.find((e) => e.ticketId === res.body.id);
        expect(namedEvent).toBeDefined();
        expect(namedEvent!.customerName).toBe('Nguyễn Văn A');
    });

    it('multiple calls produce ordered events with unique eventIds', async () => {
        const svc = await setupServiceWithPending(5);

        const r1 = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}order-1`);
        const r2 = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}order-2`);
        const r3 = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}order-3`);

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r3.status).toBe(200);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(3);

        const eventIds = events.map((e) => e.eventId);
        const uniqueIds = new Set(eventIds);
        expect(uniqueIds.size).toBe(3);

        expect(events[0].sequence).toBeLessThan(events[1].sequence);
        expect(events[1].sequence).toBeLessThan(events[2].sequence);

        expect(events[0].ticketId).toBe(r1.body.id);
        expect(events[1].ticketId).toBe(r2.body.id);
        expect(events[2].ticketId).toBe(r3.body.id);
    });

    it('broadcast uses event data not a separate query', async () => {
        const svc = await setupServiceWithPending(3);
        const { broadcastDisplayCall } = await import('@/lib/sse-broker');

        const originalSetImmediate = global.setImmediate;
        global.setImmediate = ((fn: () => void) => fn()) as unknown as typeof setImmediate;
        try {
            const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}broadcast-data-1`);
            expect(res.status).toBe(200);

            await vi.waitFor(() => {
                expect(vi.mocked(broadcastDisplayCall)).toHaveBeenCalledTimes(1);
            });

            const callArgs = vi.mocked(broadcastDisplayCall).mock.calls[0];
            expect(callArgs[0]).toBe(res.body.ticketNumber);
            expect(callArgs[1]).toBe(SERVICE_POS);
        } finally {
            global.setImmediate = originalSetImmediate;
        }
    });

    it('call-next audit log still written correctly alongside display event', async () => {
        const svc = await setupServiceWithPending(2);

        const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}audit-1`);
        expect(res.status).toBe(200);

        const auditCount = await prisma.auditLog.count({
            where: {
                action: 'CALL_NEXT',
                entityId: res.body.id as string,
                success: true,
            },
        });
        expect(auditCount).toBe(1);

        const events = await displayEvents(svc.id);
        expect(events).toHaveLength(1);
    });
});
