import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedTicketCreate = vi.fn();
const mockedServiceFindUnique = vi.fn();
const mockedTicketCount = vi.fn();
const mockedTicketAggregate = vi.fn();

const txMock = {
    service: {
        findUnique: mockedServiceFindUnique,
    },
    ticket: {
        count: mockedTicketCount,
        aggregate: mockedTicketAggregate,
        create: mockedTicketCreate,
    },
};

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
    },
}));

vi.mock('@/lib/audit-service', () => ({
    writeAuditLog: vi.fn(),
}));

import { createTicket } from '@/lib/ticket-service';

describe('createTicket PII persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedServiceFindUnique.mockResolvedValue({
            id: 'svc-1',
            isActive: true,
            prefix: 'A',
        });
        mockedTicketCount.mockResolvedValue(0);
        mockedTicketAggregate.mockResolvedValue({ _max: { position: null } });
        mockedTicketCreate.mockResolvedValue({
            id: 'ticket-1',
            serviceId: 'svc-1',
            customerName: 'Nguyen Van A',
            ticketNumber: 'A1',
            dayKey: '2026-09-24',
            position: 1,
            status: 'PENDING',
        });
    });

    it('persists a new ticket without a phone field', async () => {
        await createTicket({
            serviceId: 'svc-1',
            customerName: 'Nguyen Van A',
        });

        expect(mockedTicketCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                serviceId: 'svc-1',
                customerName: 'Nguyen Van A',
            }),
        });
    });
});
