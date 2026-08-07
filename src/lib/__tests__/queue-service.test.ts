import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TicketStatus } from '@/lib/constants';

// --- Mock Prisma client (@/lib/db) hoàn toàn, không đụng DB thật ---
// $transaction sẽ được cấu hình (trong beforeEach) để gọi callback với
// chính object mock này làm `tx`, vì bản thân queue-service.ts không phân
// biệt gì giữa `prisma` và `tx` ngoài việc tx được truyền qua callback.
vi.mock('@/lib/db', () => ({
    default: {
        $transaction: vi.fn(),
        ticket: {
            updateMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            aggregate: vi.fn(),
        },
        settings: {
            findUnique: vi.fn(),
        },
    },
}));

import prisma from '@/lib/db';
import { callNextTicket, completeTicket, skipTicket, restoreTicket } from '@/lib/queue-service';

// Ép kiểu ngắn gọn cho các mock function để gọi .mockResolvedValue... không lỗi TS
const mockedPrisma = prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
    ticket: {
        updateMany: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        aggregate: ReturnType<typeof vi.fn>;
    };
    settings: {
        findUnique: ReturnType<typeof vi.fn>;
    };
};

beforeEach(() => {
    vi.clearAllMocks();
    // Cố định thời gian để getTodayBounds()/getDayKey() xác định (deterministic),
    // tránh test bị flaky tùy theo thời điểm chạy CI.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T10:00:00'));

    // $transaction trong code thật chạy trong 1 transaction DB; ở đây ta giả lập
    // bằng cách gọi thẳng callback với `mockedPrisma` làm `tx` — vì mock không
    // phân biệt client thường vs. transaction client.
    mockedPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockedPrisma) => unknown) => {
        return cb(mockedPrisma);
    });
});

afterAll(() => {
    vi.useRealTimers();
});

describe('callNextTicket', () => {
    const serviceId = 'svc-1';
    const pos = 'Q1';

    it('gọi thành công vé đang chờ đầu tiên khi không có tranh chấp', async () => {
        const pendingTicket = { id: 'ticket-1', serviceId, status: TicketStatus.PENDING, position: 1 };
        const claimedTicket = {
            ...pendingTicket,
            status: TicketStatus.CALLED,
            pos,
            service: { id: serviceId, name: 'Dịch vụ A' },
        };

        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 0 }) // bước auto-complete: không có vé nào đang active tại quầy
            .mockResolvedValueOnce({ count: 1 }); // bước claim: thành công
        mockedPrisma.ticket.findFirst.mockResolvedValueOnce(pendingTicket);
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(claimedTicket);

        const result = await callNextTicket(serviceId, pos);

        expect(result).toEqual(claimedTicket);
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
        // Điều kiện claim phải là conditional update (chỉ claim nếu còn PENDING)
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: expect.objectContaining({ id: pendingTicket.id, status: TicketStatus.PENDING }),
                data: expect.objectContaining({ status: TicketStatus.CALLED, pos }),
            })
        );
    });

    it('báo lỗi "không còn số thứ tự" khi không có vé PENDING nào', async () => {
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 });
        mockedPrisma.ticket.findFirst.mockResolvedValueOnce(null);

        await expect(callNextTicket(serviceId, pos)).rejects.toThrow(
            'Không còn số thứ tự nào đang chờ cho dịch vụ này.'
        );
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('tự động retry khi 2 quầy claim cùng lúc (race condition), và thành công ở lần thử thứ 2', async () => {
        const pendingTicket = { id: 'ticket-1', serviceId, status: TicketStatus.PENDING, position: 1 };
        const claimedTicket = {
            ...pendingTicket,
            status: TicketStatus.CALLED,
            pos,
            service: { id: serviceId, name: 'Dịch vụ A' },
        };

        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 0 }) // attempt 1: auto-complete
            .mockResolvedValueOnce({ count: 0 }) // attempt 1: claim THẤT BẠI (quầy khác đã claim trước)
            .mockResolvedValueOnce({ count: 0 }) // attempt 2: auto-complete
            .mockResolvedValueOnce({ count: 1 }); // attempt 2: claim thành công
        mockedPrisma.ticket.findFirst
            .mockResolvedValueOnce(pendingTicket) // attempt 1
            .mockResolvedValueOnce(pendingTicket); // attempt 2
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(claimedTicket);

        const result = await callNextTicket(serviceId, pos);

        expect(result).toEqual(claimedTicket);
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledTimes(4);
    });

    it('báo lỗi "hệ thống quá tải" sau khi hết số lần retry tối đa (luôn bị tranh chấp)', async () => {
        const pendingTicket = { id: 'ticket-1', serviceId, status: TicketStatus.PENDING, position: 1 };

        // Luôn claim thất bại ở mọi lần thử -> hết MAX_CALL_RETRIES (5 lần)
        mockedPrisma.ticket.updateMany.mockResolvedValue({ count: 0 });
        mockedPrisma.ticket.findFirst.mockResolvedValue(pendingTicket);

        await expect(callNextTicket(serviceId, pos)).rejects.toThrow(
            'Không thể gọi vé — hệ thống đang quá tải, vui lòng thử lại.'
        );
        expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(5);
    });

    it('tự động hoàn tất (auto-complete) vé đang active tại quầy trước khi gọi vé mới', async () => {
        const pendingTicket = { id: 'ticket-2', serviceId, status: TicketStatus.PENDING, position: 2 };
        const claimedTicket = { ...pendingTicket, status: TicketStatus.CALLED, pos };

        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 1 }) // auto-complete: có 1 vé cũ tại quầy này bị auto-complete
            .mockResolvedValueOnce({ count: 1 }); // claim thành công
        mockedPrisma.ticket.findFirst.mockResolvedValueOnce(pendingTicket);
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(claimedTicket);

        await callNextTicket(serviceId, pos);

        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: expect.objectContaining({
                    pos,
                    status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
                }),
                data: expect.objectContaining({ status: TicketStatus.COMPLETED }),
            })
        );
    });
});

describe('completeTicket', () => {
    it('hoàn tất vé thành công khi vé đang CALLED/IN_PROGRESS', async () => {
        const completed = { id: 't1', status: TicketStatus.COMPLETED, service: { id: 'svc-1' } };
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 });
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(completed);

        const result = await completeTicket('t1');

        expect(result).toEqual(completed);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: 't1',
                    status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
                }),
                data: expect.objectContaining({ status: TicketStatus.COMPLETED }),
            })
        );
    });

    it('báo lỗi "không tìm thấy" khi vé không tồn tại', async () => {
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 });
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(null);

        await expect(completeTicket('missing')).rejects.toThrow('Không tìm thấy phiếu yêu cầu.');
    });

    it('báo lỗi "sai trạng thái" khi vé tồn tại nhưng không ở trạng thái đang phục vụ', async () => {
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 });
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce({ id: 't1', status: TicketStatus.PENDING });

        await expect(completeTicket('t1')).rejects.toThrow(
            'Vé không ở trạng thái đang phục vụ để hoàn thành.'
        );
    });
});

describe('skipTicket', () => {
    it('báo lỗi khi vé không tồn tại', async () => {
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(null);
        await expect(skipTicket('missing')).rejects.toThrow('Không tìm thấy phiếu yêu cầu.');
    });

    it('báo lỗi khi vé không ở trạng thái CALLED/IN_PROGRESS', async () => {
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce({ id: 't1', status: TicketStatus.PENDING, missCount: 0 });
        await expect(skipTicket('t1')).rejects.toThrow('Vé không ở trạng thái đang phục vụ để bỏ qua.');
    });

    it('chuyển vé sang MISSED khi missCount chạm quy tắc "MISSED" (mặc định lần thứ 4)', async () => {
        const ticket = { id: 't1', status: TicketStatus.CALLED, missCount: 3, serviceId: 'svc-1' };
        const finalTicket = { ...ticket, status: TicketStatus.MISSED, missCount: 4 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket); // đọc trạng thái hiện tại
        mockedPrisma.settings.findUnique.mockResolvedValueOnce(null); // dùng rule mặc định ['1','3','5','MISSED']
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 }); // guard update thành công
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(finalTicket); // đọc lại vé sau update

        const result = await skipTicket('t1');

        expect(result).toEqual(finalTicket);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 't1', status: TicketStatus.CALLED },
                data: expect.objectContaining({ status: TicketStatus.MISSED, missCount: 4 }),
            })
        );
    });

    it('báo lỗi khi trạng thái vé bị thay đổi bởi request khác trước khi kịp cập nhật (guard MISSED)', async () => {
        const ticket = { id: 't1', status: TicketStatus.CALLED, missCount: 3, serviceId: 'svc-1' };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.settings.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 }); // guard fail

        await expect(skipTicket('t1')).rejects.toThrow('Trạng thái vé đã thay đổi, vui lòng thử lại.');
    });

    it('đẩy vé lùi ra cuối hàng đợi khi không còn vé PENDING nào khác', async () => {
        const ticket = { id: 't1', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        const finalTicket = { ...ticket, status: TicketStatus.PENDING, position: 6, missCount: 1 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.settings.findUnique.mockResolvedValueOnce(null); // rule[0] = '1' -> pushBackBy = 1
        mockedPrisma.ticket.findMany.mockResolvedValueOnce([]); // không còn vé PENDING nào khác
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _max: { position: 5 } });
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 }); // guard update thành công
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(finalTicket);

        const result = await skipTicket('t1');

        expect(result).toEqual(finalTicket);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ position: 6, status: TicketStatus.PENDING }),
            })
        );
    });

    it('đẩy vé xuống cuối danh sách vé PENDING hiện có khi số vé PENDING <= pushBackBy', async () => {
        const ticket = { id: 't1', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        const otherPending = [{ id: 'p1', position: 3 }]; // chỉ có 1 vé PENDING, pushBackBy=1 -> length<=pushBackBy
        const finalTicket = { ...ticket, status: TicketStatus.PENDING, position: 4, missCount: 1 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.settings.findUnique.mockResolvedValueOnce(null); // pushBackBy = 1
        mockedPrisma.ticket.findMany.mockResolvedValueOnce(otherPending);
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 }); // guard update
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(finalTicket);

        const result = await skipTicket('t1');

        expect(result).toEqual(finalTicket);
        // Không cần gọi aggregate() trong nhánh này
        expect(mockedPrisma.ticket.aggregate).not.toHaveBeenCalled();
    });

    it('chèn vé vào giữa hàng đợi và đẩy lùi các vé PENDING phía sau khi số vé PENDING > pushBackBy', async () => {
        const ticket = { id: 't1', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        // pushBackBy = 1 (rule mặc định ['1','3','5','MISSED'] -> newMissCount=1 -> rule[0]='1')
        const otherPending = [
            { id: 'p1', position: 3 },
            { id: 'p2', position: 4 },
            { id: 'p3', position: 5 },
        ];
        const finalTicket = { ...ticket, status: TicketStatus.PENDING, position: 4, missCount: 1 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.settings.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.ticket.findMany.mockResolvedValueOnce(otherPending);
        mockedPrisma.ticket.updateMany
            .mockResolvedValueOnce({ count: 3 }) // đẩy lùi các vé position >= targetPos
            .mockResolvedValueOnce({ count: 1 }); // guard update vé đang skip
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(finalTicket);

        const result = await skipTicket('t1');

        expect(result).toEqual(finalTicket);
        // targetPos phải bằng position của vé thứ pushBackBy (index 0) + 1 = 3 + 1 = 4
        expect(mockedPrisma.ticket.updateMany).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: expect.objectContaining({ position: { gte: 4 } }),
                data: { position: { increment: 1 } },
            })
        );
    });

    it('dùng skip_rules tùy chỉnh từ Settings thay vì mặc định khi có cấu hình', async () => {
        const ticket = { id: 't1', status: TicketStatus.CALLED, missCount: 0, serviceId: 'svc-1' };
        // custom rules: lần đầu tiên bỏ qua đã là MISSED luôn
        const finalTicket = { ...ticket, status: TicketStatus.MISSED, missCount: 1 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.settings.findUnique.mockResolvedValueOnce({ key: 'skip_rules', value: 'MISSED' });
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 });
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(finalTicket);

        const result = await skipTicket('t1');

        expect(result).toEqual(finalTicket);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: TicketStatus.MISSED }) })
        );
    });
});

describe('restoreTicket', () => {
    it('báo lỗi khi vé không tồn tại', async () => {
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(null);
        await expect(restoreTicket('missing')).rejects.toThrow('Không tìm thấy phiếu yêu cầu.');
    });

    it('báo lỗi khi vé không ở trạng thái MISSED', async () => {
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce({ id: 't1', status: TicketStatus.PENDING });
        await expect(restoreTicket('t1')).rejects.toThrow('Chỉ có thể khôi phục các vé ở trạng thái nhỡ lượt.');
    });

    it('khôi phục vé lên đầu hàng đợi (trước vé PENDING có position nhỏ nhất)', async () => {
        const ticket = { id: 't1', status: TicketStatus.MISSED, serviceId: 'svc-1' };
        const restored = { ...ticket, status: TicketStatus.PENDING, position: 2 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _min: { position: 3 } });
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 });
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(restored);

        const result = await restoreTicket('t1');

        expect(result).toEqual(restored);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ position: 2, status: TicketStatus.PENDING }) })
        );
    });

    it('khôi phục vé về vị trí 1 khi không còn vé PENDING nào', async () => {
        const ticket = { id: 't1', status: TicketStatus.MISSED, serviceId: 'svc-1' };
        const restored = { ...ticket, status: TicketStatus.PENDING, position: 1 };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _min: { position: null } });
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 });
        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(restored);

        const result = await restoreTicket('t1');

        expect(result).toEqual(restored);
        expect(mockedPrisma.ticket.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ position: 1 }) })
        );
    });

    it('báo lỗi khi trạng thái vé bị thay đổi bởi request khác trước khi kịp khôi phục', async () => {
        const ticket = { id: 't1', status: TicketStatus.MISSED, serviceId: 'svc-1' };

        mockedPrisma.ticket.findUnique.mockResolvedValueOnce(ticket);
        mockedPrisma.ticket.aggregate.mockResolvedValueOnce({ _min: { position: null } });
        mockedPrisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 }); // guard fail

        await expect(restoreTicket('t1')).rejects.toThrow('Trạng thái vé đã thay đổi, vui lòng thử lại.');
    });
});
