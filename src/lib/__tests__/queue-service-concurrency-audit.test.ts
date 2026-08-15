import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TicketStatus } from '@/lib/constants';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            aggregate: vi.fn(),
            updateMany: vi.fn(),
        },
        settings: {
            findUnique: vi.fn(),
        },
    },
}));

import prisma from '@/lib/db';
import { skipTicket, restoreTicket } from '@/lib/queue-service';

const mockedPrisma = prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
    ticket: {
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        aggregate: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
    };
    settings: {
        findUnique: ReturnType<typeof vi.fn>;
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

describe('queue service concurrency audit', () => {
    it('serializes concurrent skips for the same service before recalculating queue state', async () => {
        const first = { id: 'called-1', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        const second = { id: 'called-2', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        const finalFirst = { ...first, status: TicketStatus.PENDING, position: 4, missCount: 1 };
        const finalSecond = { ...second, status: TicketStatus.PENDING, position: 5, missCount: 1 };

        let releaseFirst!: () => void;
        const firstTransactionPaused = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let transactionCalls = 0;

        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => {
            transactionCalls += 1;
            if (transactionCalls === 1) await firstTransactionPaused;
            return cb(mockedPrisma);
        });

        mockedPrisma.ticket.findUnique
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(second)
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(finalFirst)
            .mockResolvedValueOnce(second)
            .mockResolvedValueOnce(finalSecond);
        mockedPrisma.settings.findUnique
            .mockResolvedValueOnce({ value: '1' })
            .mockResolvedValueOnce({ value: '1' });
        mockedPrisma.ticket.findMany
            .mockResolvedValueOnce([{ id: 'pending-1', position: 3 }])
            .mockResolvedValueOnce([{ id: 'pending-1', position: 4 }]);
        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });

        const firstSkip = skipTicket(first.id);
        await Promise.resolve();
        const secondSkip = skipTicket(second.id);
        await Promise.resolve();
        await Promise.resolve();

        expect(transactionCalls).toBe(1);

        releaseFirst();
        await expect(firstSkip).resolves.toEqual(finalFirst);
        await expect(secondSkip).resolves.toEqual(finalSecond);
        expect(transactionCalls).toBe(2);

        expect(mockedPrisma.ticket.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: expect.objectContaining({ serviceId: 'svc-1', status: TicketStatus.PENDING }),
            })
        );
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                where: expect.objectContaining({ id: second.id, status: TicketStatus.CALLED }),
                data: expect.objectContaining({ status: TicketStatus.PENDING, position: 5 }),
            })
        );
    });

    it('shares the service lock between skip and restore so queue mutations cannot overlap', async () => {
        const called = { id: 'called-1', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        const missed = { id: 'missed-1', status: TicketStatus.MISSED, serviceId: 'svc-1' };
        const finalCalled = { ...called, status: TicketStatus.PENDING, position: 3, missCount: 1 };
        const finalMissed = { ...missed, status: TicketStatus.PENDING, position: 2 };

        let releaseFirst!: () => void;
        const firstTransactionPaused = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let transactionCalls = 0;

        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => {
            transactionCalls += 1;
            if (transactionCalls === 1) await firstTransactionPaused;
            return cb(mockedPrisma);
        });

        mockedPrisma.ticket.findUnique
            .mockResolvedValueOnce(called)
            .mockResolvedValueOnce(missed)
            .mockResolvedValueOnce(called)
            .mockResolvedValueOnce(finalCalled)
            .mockResolvedValueOnce(missed)
            .mockResolvedValueOnce(finalMissed);
        mockedPrisma.settings.findUnique.mockResolvedValueOnce({ value: '1' });
        mockedPrisma.ticket.findMany.mockResolvedValueOnce([{ id: 'pending-1', position: 2 }]);
        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _min: { position: 2 } });

        const skip = skipTicket(called.id);
        await Promise.resolve();
        const restore = restoreTicket(missed.id);
        await Promise.resolve();
        await Promise.resolve();

        expect(transactionCalls).toBe(1);

        releaseFirst();
        await expect(skip).resolves.toEqual(finalCalled);
        await expect(restore).resolves.toEqual(finalMissed);
        expect(transactionCalls).toBe(2);
        expect(mockedPrisma.ticket.aggregate).toHaveBeenCalledTimes(1);
    });

    it('allows queue mutations for different services to proceed independently', async () => {
        const serviceA = { id: 'called-a', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-a' };
        const serviceB = { id: 'called-b', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-b' };

        let transactionCalls = 0;
        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => {
            transactionCalls += 1;
            return cb(mockedPrisma);
        });

        mockedPrisma.ticket.findUnique
            .mockResolvedValueOnce(serviceA)
            .mockResolvedValueOnce(serviceB)
            .mockResolvedValueOnce(serviceA)
            .mockResolvedValueOnce({ ...serviceA, status: TicketStatus.MISSED, missCount: 1 })
            .mockResolvedValueOnce(serviceB)
            .mockResolvedValueOnce({ ...serviceB, status: TicketStatus.MISSED, missCount: 1 });
        mockedPrisma.settings.findUnique
            .mockResolvedValueOnce({ value: 'MISSED' })
            .mockResolvedValueOnce({ value: 'MISSED' });
        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });

        const [resultA, resultB] = await Promise.all([skipTicket(serviceA.id), skipTicket(serviceB.id)]);

        expect(resultA).toEqual({ ...serviceA, status: TicketStatus.MISSED, missCount: 1 });
        expect(resultB).toEqual({ ...serviceB, status: TicketStatus.MISSED, missCount: 1 });
        expect(transactionCalls).toBe(2);
    });
});
