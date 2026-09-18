import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TicketStatus } from '@/lib/constants';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {
            updateMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
        },
        displayCallEvent: {
            aggregate: vi.fn().mockResolvedValue({ _max: { sequence: null } }),
            create: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
            create: vi.fn().mockResolvedValue({}),
        },
    },
}));

import prisma from '@/lib/db';
import { callNextTicket } from '@/lib/queue-service';

const mockedPrisma = prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
    ticket: {
        updateMany: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
    };
    displayCallEvent: {
        aggregate: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
    };
    auditLog: {
        create: ReturnType<typeof vi.fn>;
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

describe('callNextTicket per-counter concurrency safety', () => {
    it('serializes concurrent calls on the same counter', async () => {
        const ticket1 = { id: 'ticket-1', serviceId: 'svc-1', status: TicketStatus.PENDING, position: 1 };
        const ticket2 = { id: 'ticket-2', serviceId: 'svc-1', status: TicketStatus.PENDING, position: 2 };
        const called1 = { ...ticket1, status: TicketStatus.CALLED, pos: 'Q1', service: { id: 'svc-1' } };
        const called2 = { ...ticket2, status: TicketStatus.CALLED, pos: 'Q1', service: { id: 'svc-1' } };

        let releaseFirst!: () => void;
        const firstTransactionPaused = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let transactionCalls = 0;

        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => {
            transactionCalls += 1;
            if (transactionCalls === 1) {
                await firstTransactionPaused;
            }
            return cb(mockedPrisma);
        });

        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 });
        mockedPrisma.ticket.findFirst
            .mockResolvedValueOnce(ticket1)
            .mockResolvedValueOnce(null)   // nextInQueue for first call
            .mockResolvedValueOnce(ticket2)
            .mockResolvedValueOnce(null);  // nextInQueue for second call
        mockedPrisma.ticket.findUnique
            .mockResolvedValueOnce(called1)
            .mockResolvedValueOnce(called2);

        const first = callNextTicket('svc-1', 'Q1');
        await Promise.resolve();

        const second = callNextTicket('svc-1', 'Q1');
        await Promise.resolve();
        await Promise.resolve();

        expect(transactionCalls).toBe(1);

        releaseFirst();
        await expect(first).resolves.toMatchObject({ ticket: called1, replayed: false });
        await expect(second).resolves.toMatchObject({ ticket: called2, replayed: false });
        expect(transactionCalls).toBe(2);
    });
});
