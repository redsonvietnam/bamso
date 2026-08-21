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
            .mockResolvedValueOnce(finalFirst)
            .mockResolvedValueOnce(finalSecond);
        mockedPrisma.settings.findUnique
            .mockResolvedValueOnce({ value: '1' })
            .mockResolvedValueOnce({ value: '1' });
        mockedPrisma.ticket.findMany
            .mockResolvedValueOnce([{ id: 'pending-1', position: 3 }])
            .mockResolvedValueOnce([{ id: 'pending-1', position: 4 }]);
        mockedPrisma.ticket.updateMany
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
            2,
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
            .mockResolvedValueOnce(finalCalled)
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

        // Không phụ thuộc thứ tự tiêu thụ mockResolvedValueOnce trong Promise.all:
        // mỗi service tự đếm số lần đọc, lần 1 trả trạng thái ban đầu, lần 2 trả kết quả.
        const findCalls: Record<string, number> = {};
        mockedPrisma.ticket.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
            findCalls[where.id] = (findCalls[where.id] ?? 0) + 1;
            if (where.id === serviceA.id) {
                return findCalls[where.id] === 1 ? serviceA : { ...serviceA, status: TicketStatus.MISSED, missCount: 1 };
            }
            if (where.id === serviceB.id) {
                return findCalls[where.id] === 1 ? serviceB : { ...serviceB, status: TicketStatus.MISSED, missCount: 1 };
            }
            return null;
        });
        mockedPrisma.settings.findUnique.mockResolvedValue({ value: 'MISSED' });
        mockedPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });

        const [resultA, resultB] = await Promise.all([skipTicket(serviceA.id), skipTicket(serviceB.id)]);

        expect(resultA).toEqual({ ...serviceA, status: TicketStatus.MISSED, missCount: 1 });
        expect(resultB).toEqual({ ...serviceB, status: TicketStatus.MISSED, missCount: 1 });
        expect(transactionCalls).toBe(2);
    });
});
