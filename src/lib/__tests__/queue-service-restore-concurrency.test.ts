import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TicketStatus } from '@/lib/constants';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {
            findUnique: vi.fn(),
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

describe('restoreTicket concurrency safety', () => {
    it('serializes concurrent restores for the same service', async () => {
        const missed1 = { id: 'missed-1', status: TicketStatus.MISSED, serviceId: 'svc-1' };
        const missed2 = { id: 'missed-2', status: TicketStatus.MISSED, serviceId: 'svc-1' };
        const restored1 = { ...missed1, status: TicketStatus.PENDING, position: 2 };
        const restored2 = { ...missed2, status: TicketStatus.PENDING, position: 1 };

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
            .mockResolvedValueOnce(missed1)
            .mockResolvedValueOnce(missed1)
            .mockResolvedValueOnce(restored1)
            .mockResolvedValueOnce(missed2)
            .mockResolvedValueOnce(missed2)
            .mockResolvedValueOnce(restored2);
        mockedPrisma.ticket.aggregate
            .mockResolvedValueOnce({ _min: { position: 3 } })
            .mockResolvedValueOnce({ _min: { position: 2 } });
        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });

        const first = restoreTicket('missed-1');
        await Promise.resolve();

        const second = restoreTicket('missed-2');
        await Promise.resolve();
        await Promise.resolve();

        expect(transactionCalls).toBe(1);

        releaseFirst();
        await expect(first).resolves.toEqual(restored1);
        await expect(second).resolves.toEqual(restored2);
        expect(transactionCalls).toBe(2);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: { id: 'missed-2', status: TicketStatus.MISSED },
                data: expect.objectContaining({ position: 1, status: TicketStatus.PENDING }),
            })
        );
    });
});
