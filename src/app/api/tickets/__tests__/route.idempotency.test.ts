// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sse-broker', () => ({
    broadcastQueueUpdate: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
    authenticateOptional: vi.fn(),
    requireRole: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
    getClientIp: vi.fn(() => '127.0.0.1'),
    RATE_LIMITS: { tickets: { windowMs: 60000, max: 100 } },
}));

import prisma from '@/lib/db';
import { POST } from '@/app/api/tickets/route';
import { broadcastQueueUpdate } from '@/lib/sse-broker';

const SVC_CODE = 'IDEM';
const KEY_PREFIX = 'wp-core05-';

let serviceId = '';

async function cleanup() {
    const svc = await prisma.service.findUnique({ where: { code: SVC_CODE }, select: { id: true } });
    if (svc) {
        const ticketIds = (
            await prisma.ticket.findMany({ where: { serviceId: svc.id }, select: { id: true } })
        ).map((t) => t.id);
        if (ticketIds.length > 0) {
            await prisma.auditLog.deleteMany({ where: { entityId: { in: ticketIds } } });
        }
        await prisma.ticket.deleteMany({ where: { serviceId: svc.id } });
        await prisma.service.delete({ where: { id: svc.id } });
    }
    await prisma.createTicketIdempotency.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

async function setupService() {
    await cleanup();
    const svc = await prisma.service.create({
        data: { code: SVC_CODE, name: 'Idempotency Test Service', color: '#abc', prefix: 'I', order: 1 },
        select: { id: true },
    });
    serviceId = svc.id;
    return svc;
}

function ticketRequest(body: Record<string, unknown>, idempotencyKey?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;
    return new Request('http://localhost/api/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

async function postTicket(body: Record<string, unknown>, idempotencyKey?: string) {
    const res = await POST(ticketRequest(body, idempotencyKey));
    if (!res) throw new Error('expected a response');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function ticketCount(svcId: string) {
    return prisma.ticket.count({ where: { serviceId: svcId } });
}

async function successAuditCount(ticketId: string) {
    return prisma.auditLog.count({
        where: { action: 'TICKET_CREATED', entityId: ticketId, success: true },
    });
}

async function idempotencyAuditCount() {
    return prisma.auditLog.count({
        where: { action: 'TICKET_CREATED', reasonCode: 'IDEMPOTENCY_CONFLICT', success: false },
    });
}

beforeEach(async () => {
    vi.clearAllMocks();
    await setupService();
});

afterEach(async () => {
    await cleanup();
});

describe('WP-CORE-05: CREATE-TICKET Idempotency', () => {
    describe('1. First create with Idempotency-Key', () => {
        it('creates a ticket and returns 201 with key', async () => {
            const res = await postTicket({ serviceId }, `${KEY_PREFIX}first`);
            expect(res.status).toBe(201);
            expect(res.body.id).toBeDefined();
            expect(res.body.ticketNumber).toBeDefined();
            expect(await ticketCount(serviceId)).toBe(1);
        });

        it('creates a ticket and returns 201 without key (legacy)', async () => {
            const res = await postTicket({ serviceId });
            expect(res.status).toBe(201);
            expect(res.body.id).toBeDefined();
            expect(await ticketCount(serviceId)).toBe(1);
        });
    });

    describe('2. Same-key sequential replay', () => {
        it('returns the original ticket on replay', async () => {
            const key = `${KEY_PREFIX}seq-replay`;
            const first = await postTicket({ serviceId }, key);
            expect(first.status).toBe(201);

            const second = await postTicket({ serviceId }, key);
            expect(second.status).toBe(200);
            expect(second.body.id).toBe(first.body.id);
            expect(second.body.ticketNumber).toBe(first.body.ticketNumber);
            expect(second.body.position).toBe(first.body.position);
            expect(await ticketCount(serviceId)).toBe(1);
        });

        it('does not broadcast on replay', async () => {
            vi.mocked(broadcastQueueUpdate).mockClear();
            const key = `${KEY_PREFIX}no-broadcast`;
            await postTicket({ serviceId }, key);
            const broadcastCount = vi.mocked(broadcastQueueUpdate).mock.calls.length;

            await postTicket({ serviceId }, key);
            expect(vi.mocked(broadcastQueueUpdate).mock.calls.length).toBe(broadcastCount);
        });

        it('does not create a second ticket-number or queue position', async () => {
            const key = `${KEY_PREFIX}no-position`;
            const first = await postTicket({ serviceId }, key);
            await postTicket({ serviceId }, key);

            const tickets = await prisma.ticket.findMany({
                where: { serviceId },
                orderBy: { position: 'asc' },
            });
            expect(tickets).toHaveLength(1);
            expect(tickets[0].id).toBe(first.body.id);
        });
    });

    describe('3. Same-key concurrent duplicate', () => {
        it('exactly one ticket committed from concurrent same-key requests', async () => {
            const key = `${KEY_PREFIX}concurrent`;
            const [res1, res2] = await Promise.all([
                postTicket({ serviceId }, key),
                postTicket({ serviceId }, key),
            ]);

            const statuses = [res1.status, res2.status];
            expect(statuses.filter((s) => s === 201).length).toBe(1);
            expect(statuses.filter((s) => s === 200).length).toBe(1);
            expect(res1.body.id).toBe(res2.body.id);
            expect(await ticketCount(serviceId)).toBe(1);
        });

        it('both callers receive the same canonical result', async () => {
            const key = `${KEY_PREFIX}concurrent-same-result`;
            const [res1, res2] = await Promise.all([
                postTicket({ serviceId }, key),
                postTicket({ serviceId }, key),
            ]);

            expect(res1.body.id).toBe(res2.body.id);
            expect(res1.body.ticketNumber).toBe(res2.body.ticketNumber);
            expect(res1.body.position).toBe(res2.body.position);
        });
    });

    describe('4. Same-key different payload conflict', () => {
        it('returns 409 IDEMPOTENCY_CONFLICT for different customerName', async () => {
            const key = `${KEY_PREFIX}conflict`;
            const first = await postTicket({ serviceId, customerName: 'Alice' }, key);
            expect(first.status).toBe(201);

            const second = await postTicket({ serviceId, customerName: 'Bob' }, key);
            expect(second.status).toBe(409);
            expect(second.body.code).toBe('IDEMPOTENCY_CONFLICT');
        });

        it('returns 409 for different phone', async () => {
            const key = `${KEY_PREFIX}conflict-phone`;
            await postTicket({ serviceId, phone: '0901111111' }, key);

            const res = await postTicket({ serviceId, phone: '0902222222' }, key);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT');
        });

        it('returns 409 for different serviceId', async () => {
            const key = `${KEY_PREFIX}conflict-svc`;
            await postTicket({ serviceId }, key);

            const otherSvc = await prisma.service.create({
                data: { code: `${SVC_CODE}2`, name: 'Other', color: '#def', prefix: 'J', order: 2 },
                select: { id: true },
            });

            const res = await postTicket({ serviceId: otherSvc.id }, key);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT');

            await prisma.service.delete({ where: { id: otherSvc.id } });
        });

        it('original record unchanged after conflict', async () => {
            const key = `${KEY_PREFIX}conflict-unchanged`;
            const first = await postTicket({ serviceId, customerName: 'Original' }, key);
            await postTicket({ serviceId, customerName: 'Attacker' }, key);

            const replay = await postTicket({ serviceId, customerName: 'Original' }, key);
            expect(replay.status).toBe(200);
            expect(replay.body.id).toBe(first.body.id);
        });

        it('no successful creation audit on conflict', async () => {
            const key = `${KEY_PREFIX}conflict-audit`;
            const beforeCount = await idempotencyAuditCount();
            await postTicket({ serviceId, customerName: 'A' }, key);
            await postTicket({ serviceId, customerName: 'B' }, key);

            expect(await idempotencyAuditCount()).toBe(beforeCount + 1);
        });
    });

    describe('5. Different keys create independently', () => {
        it('two different keys produce two different tickets', async () => {
            const res1 = await postTicket({ serviceId }, `${KEY_PREFIX}k1`);
            const res2 = await postTicket({ serviceId }, `${KEY_PREFIX}k2`);

            expect(res1.status).toBe(201);
            expect(res2.status).toBe(201);
            expect(res1.body.id).not.toBe(res2.body.id);
            expect(res1.body.ticketNumber).not.toBe(res2.body.ticketNumber);
            expect(res1.body.position).not.toBe(res2.body.position);
            expect(await ticketCount(serviceId)).toBe(2);
        });
    });

    describe('6. Response-loss / ambiguous outcome', () => {
        it('retry after successful commit returns original result with zero duplication', async () => {
            const key = `${KEY_PREFIX}response-loss`;

            const first = await postTicket({ serviceId }, key);
            expect(first.status).toBe(201);
            expect(await ticketCount(serviceId)).toBe(1);

            const firstTicketId = first.body.id as string;
            const firstAuditCount = await successAuditCount(firstTicketId);

            const retry = await postTicket({ serviceId }, key);
            expect(retry.status).toBe(200);
            expect(retry.body.id).toBe(firstTicketId);

            expect(await ticketCount(serviceId)).toBe(1);
            expect(await successAuditCount(firstTicketId)).toBe(firstAuditCount);
        });
    });

    describe('7. Process-boundary persistence', () => {
        it('idempotency survives across independent transaction calls', async () => {
            const key = `${KEY_PREFIX}process-boundary`;

            const first = await postTicket({ serviceId }, key);
            expect(first.status).toBe(201);

            const idempotencyRecord = await prisma.createTicketIdempotency.findUnique({
                where: { key },
            });
            expect(idempotencyRecord).not.toBeNull();
            expect(idempotencyRecord!.fingerprint).toContain(serviceId);
            expect(JSON.parse(idempotencyRecord!.ticketJson).id).toBe(first.body.id);

            const replay = await postTicket({ serviceId }, key);
            expect(replay.status).toBe(200);
            expect(replay.body.id).toBe(first.body.id);
        });
    });

    describe('8. Audit correctness', () => {
        it('exactly one successful TICKET_CREATED per logical operation', async () => {
            const key = `${KEY_PREFIX}audit-once`;
            const first = await postTicket({ serviceId }, key);
            const ticketId = first.body.id as string;

            expect(await successAuditCount(ticketId)).toBe(1);

            await postTicket({ serviceId }, key);
            expect(await successAuditCount(ticketId)).toBe(1);
        });

        it('conflict produces exactly one failed audit with IDEMPOTENCY_CONFLICT', async () => {
            const key = `${KEY_PREFIX}audit-conflict`;
            const beforeCount = await idempotencyAuditCount();
            await postTicket({ serviceId, customerName: 'A' }, key);
            await postTicket({ serviceId, customerName: 'B' }, key);

            expect(await idempotencyAuditCount()).toBe(beforeCount + 1);
        });
    });

    describe('9. Ticket number and queue position correctness', () => {
        it('replay returns the same ticket number and position', async () => {
            const key = `${KEY_PREFIX}number-pos`;
            const first = await postTicket({ serviceId }, key);
            const replay = await postTicket({ serviceId }, key);

            expect(replay.body.ticketNumber).toBe(first.body.ticketNumber);
            expect(replay.body.position).toBe(first.body.position);
        });

        it('sequential independent creates get incrementing positions', async () => {
            const r1 = await postTicket({ serviceId }, `${KEY_PREFIX}pos1`);
            const r2 = await postTicket({ serviceId }, `${KEY_PREFIX}pos2`);

            expect(r2.body.position).toBeGreaterThan(r1.body.position as number);
        });
    });

    describe('10. No-key backward compatibility', () => {
        it('requests without Idempotency-Key create tickets normally', async () => {
            const r1 = await postTicket({ serviceId });
            const r2 = await postTicket({ serviceId });

            expect(r1.status).toBe(201);
            expect(r2.status).toBe(201);
            expect(r1.body.id).not.toBe(r2.body.id);
            expect(await ticketCount(serviceId)).toBe(2);
        });

        it('identical payloads without key are NOT treated as same operation', async () => {
            const body = { serviceId, customerName: 'Same', phone: '0900000000' };
            const r1 = await postTicket(body);
            const r2 = await postTicket(body);

            expect(r1.body.id).not.toBe(r2.body.id);
            expect(await ticketCount(serviceId)).toBe(2);
        });
    });

    describe('11. Fingerprint normalization', () => {
        it('same logical request with whitespace differences produces same fingerprint', async () => {
            const key = `${KEY_PREFIX}norm`;

            const first = await postTicket({ serviceId, customerName: '  Alice  ' }, key);
            expect(first.status).toBe(201);

            const replay = await postTicket({ serviceId, customerName: 'Alice' }, key);
            expect(replay.status).toBe(200);
            expect(replay.body.id).toBe(first.body.id);
        });

        it('case-insensitive customerName normalization', async () => {
            const key = `${KEY_PREFIX}case`;

            const first = await postTicket({ serviceId, customerName: 'Alice' }, key);
            expect(first.status).toBe(201);

            const replay = await postTicket({ serviceId, customerName: 'alice' }, key);
            expect(replay.status).toBe(200);
            expect(replay.body.id).toBe(first.body.id);
        });
    });

    describe('12. Broadcast behavior', () => {
        it('fresh create broadcasts', async () => {
            vi.mocked(broadcastQueueUpdate).mockClear();
            await postTicket({ serviceId }, `${KEY_PREFIX}broadcast`);
            expect(broadcastQueueUpdate).toHaveBeenCalled();
        });

        it('replay does not broadcast', async () => {
            vi.mocked(broadcastQueueUpdate).mockClear();
            const key = `${KEY_PREFIX}no-broadcast-replay`;
            await postTicket({ serviceId }, key);
            const countBefore = vi.mocked(broadcastQueueUpdate).mock.calls.length;

            await postTicket({ serviceId }, key);
            expect(vi.mocked(broadcastQueueUpdate).mock.calls.length).toBe(countBefore);
        });
    });

    describe('13. Existing P2002 ticket collision behavior preserved', () => {
        it('concurrent ticket creation with different keys still retries on P2002', async () => {
            const results = await Promise.all([
                postTicket({ serviceId }, `${KEY_PREFIX}race1`),
                postTicket({ serviceId }, `${KEY_PREFIX}race2`),
                postTicket({ serviceId }, `${KEY_PREFIX}race3`),
            ]);

            for (const r of results) {
                expect(r.status).toBe(201);
            }
            expect(await ticketCount(serviceId)).toBe(3);

            const positions = results.map((r) => r.body.position as number).sort((a, b) => a - b);
            expect(positions).toEqual([1, 2, 3]);
        });
    });
});
