// @vitest-environment node

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';

const SERVICE_CODE = 'CORE3SVC';
const SERVICE_PREFIX = 'T3';

async function cleanup() {
    const svc = await prisma.service.findUnique({ where: { code: SERVICE_CODE }, select: { id: true } });
    if (svc) {
        await prisma.auditLog.deleteMany({
            where: { entityType: 'TICKET', entityId: { in: (await prisma.ticket.findMany({ where: { serviceId: svc.id }, select: { id: true } })).map((t) => t.id) } },
        });
        await prisma.ticket.deleteMany({ where: { serviceId: svc.id } });
        await prisma.service.delete({ where: { id: svc.id } });
    }
}

async function ensureService() {
    await cleanup();
    return prisma.service.create({
        data: {
            code: SERVICE_CODE,
            name: 'Core3 Boundary Service',
            color: '#123456',
            prefix: SERVICE_PREFIX,
            order: 1,
        },
        select: { id: true },
    });
}

beforeEach(async () => {
    vi.useFakeTimers();
});

afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
});

afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
});

describe('business-day boundary: dayKey and numbering reset at Vietnam midnight (real DB)', () => {
    it('ticket just before Vietnam midnight belongs to Sep 13', async () => {
        const svc = await ensureService();
        vi.setSystemTime(new Date('2026-09-13T16:59:00.000Z'));

        const ticket = await createTicket({ serviceId: svc.id });

        expect(ticket.dayKey).toBe('2026-09-13');
        expect(ticket.ticketNumber.startsWith(SERVICE_PREFIX)).toBe(true);
    });

    it('ticket at Vietnam midnight belongs to Sep 14 with numbering reset', async () => {
        const svc = await ensureService();
        vi.setSystemTime(new Date('2026-09-13T16:59:00.000Z'));
        const before = await createTicket({ serviceId: svc.id });

        vi.setSystemTime(new Date('2026-09-13T17:00:00.000Z'));
        const after = await createTicket({ serviceId: svc.id });

        expect(before.dayKey).toBe('2026-09-13');
        expect(after.dayKey).toBe('2026-09-14');
        // Numbering is per Vietnam day: both days start at sequence 1.
        expect(before.ticketNumber).toBe(`${SERVICE_PREFIX}1`);
        expect(after.ticketNumber).toBe(`${SERVICE_PREFIX}1`);
    });

    it('ticket at 00:05 Vietnam belongs to the new day', async () => {
        const svc = await ensureService();
        vi.setSystemTime(new Date('2026-09-13T17:05:00.000Z'));

        const ticket = await createTicket({ serviceId: svc.id });

        expect(ticket.dayKey).toBe('2026-09-14');
    });
});
