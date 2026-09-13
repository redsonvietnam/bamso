import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketStatus } from '@/lib/constants';

vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {},
        callNextIdempotency: {},
    },
}));

vi.mock('@/lib/audit-service', () => ({
    writeAuditLog: vi.fn(),
}));

import prisma from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-service';
import { callNextTicket } from '@/lib/queue-service';

const mockedPrisma = prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
};

const mockedWriteAuditLog = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

const KEY = 'k-unit-1';
const FINGERPRINT = JSON.stringify({ serviceId: 'svc-1', pos: 'Q1', actorId: null, actorRole: null });

function p2002(modelName: string, target: string[]) {
    return Object.assign(new Error(`Unique constraint failed on the fields: (${target.join(', ')})`), {
        code: 'P2002',
        meta: { modelName, target },
    });
}

function makeTx() {
    return {
        ticket: {
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
        },
        callNextIdempotency: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            deleteMany: vi.fn(),
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('callNextTicket P2002 reservation recovery (WP-CORE-04)', () => {
    it('P2002 loser retries into replay with zero mutation and zero audit', async () => {
        const replayedRow = { id: 't-orig', ticketNumber: 'Q41', serviceId: 'svc-1' };
        const tx = makeTx();
        tx.callNextIdempotency.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ key: KEY, fingerprint: FINGERPRINT, ticketId: 't-orig', ticketNumber: 'Q41' });
        tx.callNextIdempotency.create.mockRejectedValueOnce(p2002('CallNextIdempotency', ['key']));
        tx.ticket.findUnique.mockResolvedValueOnce(replayedRow);
        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

        const result = await callNextTicket('svc-1', 'Q1', undefined, { idempotencyKey: KEY });

        expect(result).toEqual({ ticket: replayedRow, replayed: true });
        // Loser transaction rolled back; exactly one retry observed the winner.
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2);
        expect(tx.callNextIdempotency.create).toHaveBeenCalledTimes(1);
        // Zero queue mutation and zero audit across both attempts.
        expect(tx.ticket.updateMany).not.toHaveBeenCalled();
        expect(mockedWriteAuditLog).not.toHaveBeenCalled();
    });

    it('P2002 on another table propagates without retry', async () => {
        const tx = makeTx();
        tx.callNextIdempotency.findUnique.mockResolvedValueOnce(null);
        tx.callNextIdempotency.create.mockRejectedValueOnce(p2002('Ticket', ['serviceId', 'dayKey', 'ticketNumber']));
        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

        await expect(callNextTicket('svc-1', 'Q1', undefined, { idempotencyKey: KEY })).rejects.toMatchObject({
            code: 'P2002',
        });
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('non-P2002 reservation failure propagates without retry', async () => {
        const tx = makeTx();
        tx.callNextIdempotency.findUnique.mockResolvedValueOnce(null);
        tx.callNextIdempotency.create.mockRejectedValueOnce(new Error('connection lost'));
        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

        await expect(callNextTicket('svc-1', 'Q1', undefined, { idempotencyKey: KEY })).rejects.toThrow(
            'connection lost'
        );
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('fresh keyed operation reports replayed:false', async () => {
        const pending = { id: 't-1', serviceId: 'svc-1', status: TicketStatus.PENDING, position: 1 };
        const claimed = { ...pending, status: TicketStatus.CALLED, pos: 'Q1' };
        const tx = makeTx();
        tx.callNextIdempotency.findUnique.mockResolvedValueOnce(null);
        tx.callNextIdempotency.create.mockResolvedValueOnce({ key: KEY, fingerprint: FINGERPRINT });
        tx.ticket.findFirst.mockResolvedValueOnce(pending);
        tx.ticket.updateMany
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 });
        tx.ticket.findUnique.mockResolvedValueOnce(claimed);
        tx.callNextIdempotency.update.mockResolvedValueOnce({});
        mockedPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

        const result = await callNextTicket('svc-1', 'Q1', undefined, { idempotencyKey: KEY });

        expect(result).toEqual({ ticket: claimed, replayed: false });
        expect(mockedWriteAuditLog).toHaveBeenCalledTimes(1);
    });
});
