import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    default: {
        displayCallEvent: {
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

import prisma from '@/lib/db';
import { recoverPendingDisplayEvents } from '@/lib/display-recovery';

const mockedPrisma = prisma as unknown as {
    displayCallEvent: {
        findMany: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
    };
};

describe('CORE-06 display recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-23T10:00:00'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns today PENDING events in deterministic createdAt/id order and marks exactly those events delivered', async () => {
        const first = {
            id: 'row-a',
            eventId: 'event-a',
            ticketNumber: 'A001',
            pos: 'Q1',
            customerName: 'Alice',
            nextTicketNumber: 'A002',
            status: 'PENDING',
            createdAt: new Date('2026-09-23T09:00:00'),
        };
        const second = {
            id: 'row-b',
            eventId: 'event-b',
            ticketNumber: 'A002',
            pos: 'Q2',
            customerName: null,
            nextTicketNumber: null,
            status: 'PENDING',
            createdAt: new Date('2026-09-23T09:01:00'),
        };
        mockedPrisma.displayCallEvent.findMany.mockResolvedValue([first, second]);
        mockedPrisma.displayCallEvent.updateMany.mockResolvedValue({ count: 2 });

        const recovery = await recoverPendingDisplayEvents();

        expect(mockedPrisma.displayCallEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ status: 'PENDING' }),
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }));
        expect(recovery.events).toEqual([
            expect.objectContaining({ id: 'row-a', eventId: 'event-a', ticketNumber: 'A001' }),
            expect.objectContaining({ id: 'row-b', eventId: 'event-b', ticketNumber: 'A002' }),
        ]);

        await recovery.markDelivered();

        expect(mockedPrisma.displayCallEvent.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['row-a', 'row-b'] } },
            data: { status: 'DELIVERED' },
        });
    });

    it('does not issue a delivery update when there are no pending events', async () => {
        mockedPrisma.displayCallEvent.findMany.mockResolvedValue([]);

        const recovery = await recoverPendingDisplayEvents();
        await recovery.markDelivered();

        expect(recovery.events).toEqual([]);
        expect(mockedPrisma.displayCallEvent.updateMany).not.toHaveBeenCalled();
    });
});
