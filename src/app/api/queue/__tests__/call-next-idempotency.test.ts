// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(async () => ({ payload: { userId: 'core4-user', role: 'ADMIN' } })),
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

const SERVICE_CODE = 'CORE4SVC';
const SERVICE_POS = 'Quầy 1';
const KEY_PREFIX = 'core4-';

async function cleanup() {
    const svc = await prisma.service.findUnique({ where: { code: SERVICE_CODE }, select: { id: true } });
    if (svc) {
        const ticketIds = (
            await prisma.ticket.findMany({ where: { serviceId: svc.id }, select: { id: true } })
        ).map((t) => t.id);
        if (ticketIds.length > 0) {
            await prisma.auditLog.deleteMany({ where: { entityId: { in: ticketIds } } });
        }
        await prisma.auditLog.deleteMany({ where: { actorId: 'core4-user' } });
        await prisma.ticket.deleteMany({ where: { serviceId: svc.id } });
        await prisma.service.delete({ where: { id: svc.id } });
    }
    await prisma.callNextIdempotency.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

async function setupServiceWithPending(count: number) {
    await cleanup();
    const svc = await prisma.service.create({
        data: {
            code: SERVICE_CODE,
            name: 'Core4 Idempotency Service',
            color: '#123456',
            prefix: 'Q4',
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

async function successAuditCount(ticketId: string) {
    return prisma.auditLog.count({
        where: { action: 'CALL_NEXT', entityId: ticketId, success: true },
    });
}

beforeEach(async () => {
    vi.clearAllMocks();
});

afterEach(async () => {
    await cleanup();
});

describe('POST /api/queue/call-next idempotency (WP-CORE-04)', () => {
    it('fresh call with a key succeeds and records the operation', async () => {
        const svc = await setupServiceWithPending(2);

        const res = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-1`);

        expect(res.status).toBe(200);
        expect(res.body.ticketNumber).toBe('Q41');
        const record = await prisma.callNextIdempotency.findUnique({ where: { key: `${KEY_PREFIX}op-1` } });
        expect(record?.ticketId).toBe(res.body.id);
        expect(await successAuditCount(res.body.id as string)).toBe(1);
    });

    it('retry with the same key and fingerprint replays the same ticket without advancing', async () => {
        const svc = await setupServiceWithPending(2);

        const first = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-2`);
        expect(first.status).toBe(200);

        const retry = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-2`);
        expect(retry.status).toBe(200);
        expect(retry.body.id).toBe(first.body.id);
        expect(retry.body.ticketNumber).toBe(first.body.ticketNumber);

        // Queue advanced exactly once: the second pending ticket is untouched.
        const called = await prisma.ticket.findMany({
            where: { serviceId: svc.id, status: 'CALLED' },
        });
        expect(called).toHaveLength(1);
        expect(called[0]?.id).toBe(first.body.id);
        // No second logical successful CALL_NEXT audit action.
        expect(await successAuditCount(first.body.id as string)).toBe(1);
    });

    it('replay performs zero broadcast side effects (exact call counts)', async () => {
        const svc = await setupServiceWithPending(2);
        const { broadcastQueueUpdate, broadcastDisplayCall } = await import('@/lib/sse-broker');

        // Execute setImmediate callbacks inline so broadcasts land deterministically.
        const originalSetImmediate = global.setImmediate;
        global.setImmediate = ((fn: () => void) => fn()) as unknown as typeof setImmediate;
        try {
            const fresh = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-nb`);
            expect(fresh.status).toBe(200);
            await vi.waitFor(() => {
                expect(vi.mocked(broadcastQueueUpdate)).toHaveBeenCalledTimes(1);
                expect(vi.mocked(broadcastDisplayCall)).toHaveBeenCalledTimes(1);
            });

            const replay = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-nb`);
            expect(replay.status).toBe(200);
            expect(replay.body.id).toBe(fresh.body.id);
            // Allow any stray async broadcast to land, then assert silence.
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(vi.mocked(broadcastQueueUpdate)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(broadcastDisplayCall)).toHaveBeenCalledTimes(1);
        } finally {
            global.setImmediate = originalSetImmediate;
        }
    });

    it('database enforces key uniqueness behind P2002 recovery', async () => {
        await prisma.callNextIdempotency.create({
            data: { key: `${KEY_PREFIX}dup`, fingerprint: 'a' },
        });
        await expect(
            prisma.callNextIdempotency.create({
                data: { key: `${KEY_PREFIX}dup`, fingerprint: 'b' },
            })
        ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('concurrent retries of the same key resolve to one ticket and one audit', async () => {
        const svc = await setupServiceWithPending(3);

        const [a, b] = await Promise.all([
            postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-3`),
            postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-3`),
        ]);

        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect(a.body.id).toBe(b.body.id);

        const called = await prisma.ticket.findMany({
            where: { serviceId: svc.id, status: 'CALLED' },
        });
        expect(called).toHaveLength(1);
        expect(await successAuditCount(a.body.id as string)).toBe(1);
    });

    it('different keys are independent operations', async () => {
        const svc = await setupServiceWithPending(3);

        const first = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-4a`);
        const second = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-4b`);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.ticketNumber).toBe('Q42');
        expect(second.body.id).not.toBe(first.body.id);
    });

    it('same key with a different fingerprint is rejected with 409 and no mutation', async () => {
        const svc = await setupServiceWithPending(2);

        const first = await postCallNext(svc.id, SERVICE_POS, `${KEY_PREFIX}op-5`);
        expect(first.status).toBe(200);

        const pendingBefore = await prisma.ticket.count({
            where: { serviceId: svc.id, status: 'PENDING' },
        });

        const reuse = await postCallNext(svc.id, 'Quầy 2', `${KEY_PREFIX}op-5`);
        expect(reuse.status).toBe(409);
        expect(reuse.body.code).toBe('IDEMPOTENCY_CONFLICT');

        const pendingAfter = await prisma.ticket.count({
            where: { serviceId: svc.id, status: 'PENDING' },
        });
        expect(pendingAfter).toBe(pendingBefore);
        expect(await successAuditCount(first.body.id as string)).toBe(1);
    });

    it('absent key keeps the legacy path with no idempotency record', async () => {
        const svc = await setupServiceWithPending(1);

        const res = await postCallNext(svc.id, SERVICE_POS);

        expect(res.status).toBe(200);
        expect(
            await prisma.callNextIdempotency.count({ where: { key: { startsWith: KEY_PREFIX } } })
        ).toBe(0);
    });

    it('blank key is treated as absent', async () => {
        const svc = await setupServiceWithPending(1);

        const res = await postCallNext(svc.id, SERVICE_POS, '   ');

        expect(res.status).toBe(200);
        expect(
            await prisma.callNextIdempotency.count({ where: { key: { startsWith: KEY_PREFIX } } })
        ).toBe(0);
    });
});
