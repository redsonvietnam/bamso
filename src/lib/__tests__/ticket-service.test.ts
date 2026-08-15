import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketStatus } from '@/lib/constants';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        service: {
            findUnique: vi.fn(),
        },
        ticket: {
            count: vi.fn(),
            aggregate: vi.fn(),
            create: vi.fn(),
        },
    },
}));

import prisma from '@/lib/db';
import { createTicket } from '@/lib/ticket-service';

const mockedPrisma = prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
    service: {
        findUnique: ReturnType<typeof vi.fn>;
    };
    ticket: {
        count: ReturnType<typeof vi.fn>;
        aggregate: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
    };
};

function uniqueConflict() {
    return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T09:00:00'));

    mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => {
        return cb(mockedPrisma);
    });
    mockedPrisma.service.findUnique.mockResolvedValue({
        id: 'svc-1',
        prefix: 'A',
        isActive: true,
    });
});

afterAll(() => {
    vi.useRealTimers();
});

describe('createTicket', () => {
    it('creates a ticket with daily ticket number, dayKey, and next queue position', async () => {
        const ticket = {
            id: 'ticket-1',
            serviceId: 'svc-1',
            ticketNumber: 'A3',
            dayKey: '2026-08-15',
            position: 3,
            status: TicketStatus.PENDING,
        };

        mockedPrisma.ticket.count.mockResolvedValueOnce(2);
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _max: { position: 2 } });
        mockedPrisma.ticket.create.mockResolvedValueOnce(ticket);

        await expect(createTicket({ serviceId: 'svc-1' })).resolves.toEqual(ticket);

        expect(mockedPrisma.ticket.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                serviceId: 'svc-1',
                ticketNumber: 'A3',
                dayKey: '2026-08-15',
                position: 3,
                status: TicketStatus.PENDING,
            }),
        });
    });

    it('retries when a unique constraint catches a concurrent ticket creation', async () => {
        const retriedTicket = {
            id: 'ticket-2',
            serviceId: 'svc-1',
            ticketNumber: 'A3',
            dayKey: '2026-08-15',
            position: 3,
            status: TicketStatus.PENDING,
        };

        mockedPrisma.ticket.count
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(2);
        mockedPrisma.ticket.aggregate
            .mockResolvedValueOnce({ _max: { position: 1 } })
            .mockResolvedValueOnce({ _max: { position: 2 } });
        mockedPrisma.ticket.create
            .mockRejectedValueOnce(uniqueConflict())
            .mockResolvedValueOnce(retriedTicket);

        await expect(createTicket({ serviceId: 'svc-1' })).resolves.toEqual(retriedTicket);

        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2);
        expect(mockedPrisma.ticket.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                data: expect.objectContaining({ ticketNumber: 'A2', position: 2 }),
            })
        );
        expect(mockedPrisma.ticket.create).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                data: expect.objectContaining({ ticketNumber: 'A3', position: 3 }),
            })
        );
    });

    it('rejects inactive or missing services', async () => {
        mockedPrisma.service.findUnique.mockResolvedValueOnce({ id: 'svc-1', isActive: false });

        await expect(createTicket({ serviceId: 'svc-1' })).rejects.toThrow(
            'Dịch vụ không tồn tại hoặc đã ngừng hoạt động'
        );
        expect(mockedPrisma.ticket.create).not.toHaveBeenCalled();
    });
});
