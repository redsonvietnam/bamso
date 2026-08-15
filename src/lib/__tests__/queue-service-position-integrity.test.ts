import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TicketStatus } from '@/lib/constants';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            aggregate: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

import prisma from '@/lib/db';
import { restoreTicket } from '@/lib/queue-service';

const mockedPrisma = prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
    ticket: {
        findUnique: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        aggregate: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
    };
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T10:00:00'));
    mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => cb(mockedPrisma));
});

afterAll(() => {
    vi.useRealTimers();
});

describe('restoreTicket position integrity', () => {
    it('keeps positions positive when restoring into a queue already starting at position 1', async () => {
        const missed = {
            id: 'missed-1',
            serviceId: 'svc-1',
            status: TicketStatus.MISSED,
            missCount: 2,
        };
        const pending = {
            id: 'pending-1',
            serviceId: 'svc-1',
            status: TicketStatus.PENDING,
            position: 1,
        };
        const restored = {
            ...missed,
            status: TicketStatus.PENDING,
            position: 1,
            missCount: 0,
        };

        mockedPrisma.ticket.findUnique
            .mockResolvedValueOnce(missed)
            .mockResolvedValueOnce(missed)
            .mockResolvedValueOnce(restored);
        mockedPrisma.ticket.aggregate
            .mockResolvedValueOnce({ _min: { position: 1 } })
            .mockResolvedValueOnce({ _max: { position: 2 } });
        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });

        const result = await restoreTicket(missed.id);

        expect(result).toEqual(restored);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: expect.objectContaining({ serviceId: 'svc-1', status: TicketStatus.PENDING }),
                data: { position: { increment: 3 } },
            })
        );
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: expect.objectContaining({ serviceId: 'svc-1', status: TicketStatus.PENDING, position: { gte: 4 } }),
                data: { position: { decrement: 2 } },
            })
        );
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                where: { id: missed.id, status: TicketStatus.MISSED },
                data: expect.objectContaining({ status: TicketStatus.PENDING, position: 1 }),
            })
        );
    });

    it('uses the free positive position before a queue whose minimum position is greater than 1', async () => {
        const missed = {
            id: 'missed-2',
            serviceId: 'svc-2',
            status: TicketStatus.MISSED,
            missCount: 1,
        };
        const restored = {
            ...missed,
            status: TicketStatus.PENDING,
            position: 4,
            missCount: 0,
        };

        mockedPrisma.ticket.findUnique
            .mockResolvedValueOnce(missed)
            .mockResolvedValueOnce(missed)
            .mockResolvedValueOnce(restored);
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _min: { position: 5 } });
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 });

        const result = await restoreTicket(missed.id);

        expect(result).toEqual(restored);
        expect(mockedPrisma.ticket.aggregate).toHaveBeenCalledTimes(1);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: missed.id, status: TicketStatus.MISSED },
                data: expect.objectContaining({ status: TicketStatus.PENDING, position: 4 }),
            })
        );
    });
});
