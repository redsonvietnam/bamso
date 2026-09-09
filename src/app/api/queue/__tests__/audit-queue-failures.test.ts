// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuditCreate } = vi.hoisted(() => ({
    mockAuditCreate: vi.fn().mockResolvedValue({ id: 'audit-log-id' }),
}));

vi.mock('@/lib/api-auth', () => ({
    requireRole: vi.fn(),
}));

vi.mock('@/lib/queue-service', () => ({
    callNextTicket: vi.fn(),
    restoreTicket: vi.fn(),
    skipTicket: vi.fn(),
    completeTicket: vi.fn(),
}));

vi.mock('@/lib/sse-broker', () => ({
    broadcastQueueUpdate: vi.fn(),
    broadcastDisplayCall: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    default: {
        ticket: {
            findFirst: vi.fn(),
        },
        auditLog: {
            create: mockAuditCreate,
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        log: vi.fn(),
    },
}));

import { POST as callNext } from '@/app/api/queue/call-next/route';
import { PUT as complete } from '@/app/api/queue/complete/route';
import { PUT as skip } from '@/app/api/queue/skip/route';
import { PUT as restore } from '@/app/api/queue/restore/route';
import { requireRole } from '@/lib/api-auth';
import { callNextTicket, completeTicket, skipTicket, restoreTicket } from '@/lib/queue-service';

const mockedRequireRole = requireRole as unknown as ReturnType<typeof vi.fn>;
const mockedCallNextTicket = callNextTicket as unknown as ReturnType<typeof vi.fn>;
const mockedCompleteTicket = completeTicket as unknown as ReturnType<typeof vi.fn>;
const mockedSkipTicket = skipTicket as unknown as ReturnType<typeof vi.fn>;
const mockedRestoreTicket = restoreTicket as unknown as ReturnType<typeof vi.fn>;

describe('Queue Failure Audit Logging', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedRequireRole.mockResolvedValue({
            payload: { userId: 'staff-user-1', role: 'STAFF' },
        });
    });

    it('writes audit on CALL_NEXT validation error', async () => {
        const req = new Request('http://localhost/api/queue/call-next', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ serviceId: 'svc-1' }), // missing pos
        });

        const res = await callNext(req);
        expect(res?.status).toBe(400);

        expect(mockAuditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'CALL_NEXT',
                    success: false,
                    reasonCode: 'INVALID_FIELDS',
                    actorId: 'staff-user-1',
                }),
            })
        );
    });

    it('writes audit on CALL_NEXT when no tickets pending', async () => {
        mockedCallNextTicket.mockRejectedValue(new Error('Không còn số thứ tự nào đang chờ cho dịch vụ này.'));

        const req = new Request('http://localhost/api/queue/call-next', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ serviceId: 'svc-1', pos: 'Quầy 1' }),
        });

        const res = await callNext(req);
        expect(res?.status).toBe(400);

        expect(mockAuditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'CALL_NEXT',
                    success: false,
                    reasonCode: 'NO_PENDING_TICKETS',
                    metadata: JSON.stringify({ counter: 'Quầy 1' }),
                }),
            })
        );
    });

    it('writes audit on COMPLETE when ticket is not in serving status', async () => {
        mockedCompleteTicket.mockRejectedValue(new Error('Vé không ở trạng thái đang phục vụ để hoàn thành.'));

        const req = new Request('http://localhost/api/queue/complete', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticketId: 'ticket-999' }),
        });

        const res = await complete(req);
        expect(res?.status).toBe(400);

        expect(mockAuditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'COMPLETE',
                    entityId: 'ticket-999',
                    success: false,
                    reasonCode: 'INVALID_STATUS',
                }),
            })
        );
    });

    it('writes audit on SKIP when ticket not found', async () => {
        mockedSkipTicket.mockRejectedValue(new Error('Không tìm thấy phiếu yêu cầu.'));

        const req = new Request('http://localhost/api/queue/skip', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticketId: 'ticket-missing' }),
        });

        const res = await skip(req);
        expect(res?.status).toBe(400);

        expect(mockAuditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'SKIP',
                    entityId: 'ticket-missing',
                    success: false,
                    reasonCode: 'NOT_FOUND',
                }),
            })
        );
    });

    it('writes audit on RESTORE when ticket is not in missed status', async () => {
        mockedRestoreTicket.mockRejectedValue(new Error('Chỉ có thể khôi phục các vé ở trạng thái nhỡ lượt.'));

        const req = new Request('http://localhost/api/queue/restore', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticketId: 'ticket-not-missed' }),
        });

        const res = await restore(req);
        expect(res?.status).toBe(400);

        expect(mockAuditCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'RESTORE',
                    entityId: 'ticket-not-missed',
                    success: false,
                    reasonCode: 'INVALID_STATUS',
                }),
            })
        );
    });
});
