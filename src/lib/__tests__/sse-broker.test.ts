import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketStatus } from '@/lib/constants';

// --- Mock hoàn toàn các dependency, không đụng DB/Redis thật ---
vi.mock('@/lib/db', () => ({
    default: {
        ticket: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/redis', () => ({
    redis: {
        publish: vi.fn(),
    },
    redisPubSub: {
        subscribe: vi.fn(),
        on: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

import prisma from '@/lib/db';
import { redis, redisPubSub } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { SSEBroker } from '@/lib/sse-broker';

const mockedPrisma = prisma as unknown as {
    ticket: {
        findMany: ReturnType<typeof vi.fn>;
    };
};
const mockedRedis = redis as unknown as { publish: ReturnType<typeof vi.fn> };
const mockedRedisPubSub = redisPubSub as unknown as {
    subscribe: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
};

const decoder = new TextDecoder();

/** Tạo controller giả ghi lại mọi dữ liệu được enqueue dưới dạng text. */
function makeController() {
    const controller = {
        enqueue: vi.fn((_data: Uint8Array) => {
            // noop — mock record dữ liệu qua mock.calls
        }),
    } as unknown as ReadableStreamDefaultController;
    return { controller };
}

/** Đọc mọi dữ liệu được enqueue, decode thành chuỗi ghép. */
function received(controller: ReadableStreamDefaultController): string {
    const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
    return enqueueMock.mock.calls.map(([c]) => decoder.decode(c as Uint8Array)).join('');
}

/** Parse event JSON từ chuỗi SSE dạng "data: {...}\n\n". */
function parseEvent(text: string): unknown {
    const lines = text.split('\n').filter(Boolean);
    const dataLine = lines.find((l) => l.startsWith('data: ')) ?? lines[0];
    return JSON.parse(dataLine.replace(/^data: /, ''));
}

/** Tạo broker mới cho từng test — tránh singleton giữ state giữa các test. */
function createBroker(): SSEBroker {
    const broker = new SSEBroker();
    (broker as unknown as { init: () => void }).init();
    return broker;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockedRedis.publish.mockResolvedValue(1);
    mockedRedisPubSub.subscribe.mockResolvedValue([]);
});

describe('subscribeQueue / unsubscribeQueue', () => {
    it('queue client nhận được QUEUE_UPDATE sau khi subscribe', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        const ticket = { id: 't1', ticketNumber: 'A001', status: TicketStatus.PENDING, position: 1, serviceId: 'svc-1' };
        mockedPrisma.ticket.findMany.mockResolvedValueOnce([ticket]);

        broker.subscribeQueue('client-1', controller);
        await broker.broadcastQueueUpdate('svc-1');

        const event = parseEvent(received(controller)) as { type: string; tickets: { id: string }[] };
        expect(event.type).toBe('QUEUE_UPDATE');
        expect(event.tickets).toHaveLength(1);
        expect(event.tickets[0].id).toBe('t1');
    });

    it('sau khi unsubscribe, client không còn nhận broadcast nữa', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue([]);

        broker.subscribeQueue('client-1', controller);
        broker.unsubscribeQueue('client-1');
        await broker.broadcastQueueUpdate();

        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        expect(enqueueMock).not.toHaveBeenCalled();
    });
});

describe('subscribeDisplay / unsubscribeDisplay', () => {
    it('display client nhận được DISPLAY_CALL kèm customerName', async () => {
        const broker = createBroker();
        const { controller } = makeController();

        broker.subscribeDisplay('display-1', controller);
        await broker.broadcastDisplayCall('A001', 'Q1', 'Nguyễn Văn A');

        const event = parseEvent(received(controller)) as { type: string; ticketNumber: string; pos: string; customerName: string };
        expect(event.type).toBe('DISPLAY_CALL');
        expect(event.ticketNumber).toBe('A001');
        expect(event.pos).toBe('Q1');
        expect(event.customerName).toBe('Nguyễn Văn A');
    });

    it('sau khi unsubscribe, display client không còn nhận broadcast', async () => {
        const broker = createBroker();
        const { controller } = makeController();

        broker.subscribeDisplay('display-1', controller);
        broker.unsubscribeDisplay('display-1');
        await broker.broadcastDisplayCall('A001', 'Q1');

        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        expect(enqueueMock).not.toHaveBeenCalled();
    });
});

describe('broadcastQueueUpdate — lọc theo serviceId', () => {
    it('client theo dõi 1 dịch vụ chỉ nhận vé của dịch vụ đó', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        const tickets = [
            { id: 't-a', serviceId: 'svc-a', position: 1 },
            { id: 't-b', serviceId: 'svc-b', position: 2 },
        ];
        mockedPrisma.ticket.findMany.mockResolvedValue(tickets);

        broker.subscribeQueue('client-a', controller, 'svc-a');
        await broker.broadcastQueueUpdate('svc-a');

        const event = parseEvent(received(controller)) as { tickets: { id: string }[] };
        expect(event.tickets.map((t) => t.id)).toEqual(['t-a']);
    });

    it('client không filter theo serviceId sẽ nhận toàn bộ vé', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        const tickets = [
            { id: 't-a', serviceId: 'svc-a', position: 1 },
            { id: 't-b', serviceId: 'svc-b', position: 2 },
        ];
        mockedPrisma.ticket.findMany.mockResolvedValue(tickets);

        broker.subscribeQueue('client-all', controller);
        await broker.broadcastQueueUpdate('svc-a');

        const event = parseEvent(received(controller)) as { tickets: { id: string }[] };
        expect(event.tickets.map((t) => t.id)).toEqual(['t-a', 't-b']);
    });

    it('client filter svc-a không nhận gì khi broadcast cho svc-b', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue([]);

        broker.subscribeQueue('client-a', controller, 'svc-a');
        await broker.broadcastQueueUpdate('svc-b');

        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        expect(enqueueMock).not.toHaveBeenCalled();
    });
});

describe('broadcastQueueUpdate — redaction theo role', () => {
    const ticketsWithPII = [
        {
            id: 't1',
            ticketNumber: 'A001',
            status: TicketStatus.PENDING,
            position: 1,
            serviceId: 'svc-1',
            customerName: 'Nguyễn Văn A',
            phone: '0909999999',
        },
    ];

    it('client ẩn danh (không role) KHÔNG nhận customerName/phone', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue(ticketsWithPII);

        broker.subscribeQueue('anon', controller);
        await broker.broadcastQueueUpdate();

        const event = parseEvent(received(controller)) as {
            tickets: { id: string; customerName?: string; phone?: string }[];
        };
        expect(event.tickets[0].customerName).toBeUndefined();
        expect(event.tickets[0].phone).toBeUndefined();
        expect(event.tickets[0].id).toBe('t1'); // các field khác vẫn còn
    });

    it('client STAFF vẫn nhận đầy đủ customerName/phone', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue(ticketsWithPII);

        broker.subscribeQueue('staff', controller, null, 'STAFF');
        await broker.broadcastQueueUpdate();

        const event = parseEvent(received(controller)) as {
            tickets: { customerName?: string; phone?: string }[];
        };
        expect(event.tickets[0].customerName).toBe('Nguyễn Văn A');
        expect(event.tickets[0].phone).toBe('0909999999');
    });

    it('client ADMIN vẫn nhận đầy đủ customerName/phone', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue(ticketsWithPII);

        broker.subscribeQueue('admin', controller, null, 'ADMIN');
        await broker.broadcastQueueUpdate();

        const event = parseEvent(received(controller)) as {
            tickets: { customerName?: string; phone?: string }[];
        };
        expect(event.tickets[0].customerName).toBe('Nguyễn Văn A');
        expect(event.tickets[0].phone).toBe('0909999999');
    });
});

describe('broadcastQueueUpdate — fail-open Redis', () => {
    it('vẫn broadcast local khi Redis publish thất bại (không throw)', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue([{ id: 't1', serviceId: 'svc-1' }]);
        mockedRedis.publish.mockRejectedValue(new Error('Redis down'));

        broker.subscribeQueue('client-1', controller);
        await expect(broker.broadcastQueueUpdate()).resolves.not.toThrow();

        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        expect(enqueueMock).toHaveBeenCalled();
    });

    it('vẫn broadcast local khi Redis subscribe thất bại (không throw)', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        mockedPrisma.ticket.findMany.mockResolvedValue([{ id: 't1', serviceId: 'svc-1' }]);
        mockedRedisPubSub.subscribe.mockRejectedValue(new Error('Redis down'));

        broker.subscribeQueue('client-1', controller);
        await expect(broker.broadcastQueueUpdate()).resolves.not.toThrow();

        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        expect(enqueueMock).toHaveBeenCalled();
    });

    it('gọi redis.publish đúng channel QUEUE_UPDATE với serviceId', async () => {
        const broker = createBroker();
        mockedPrisma.ticket.findMany.mockResolvedValue([]);

        await broker.broadcastQueueUpdate('svc-1');

        expect(mockedRedis.publish).toHaveBeenCalledWith(
            'queue:updates',
            JSON.stringify({ serviceId: 'svc-1' })
        );
    });
});

describe('broadcastDisplayCall', () => {
    it('display client nhận customerName; queue client nhận payload KHÔNG có customerName', async () => {
        const broker = createBroker();
        const displayCtrl = makeController();
        const queueCtrl = makeController();

        broker.subscribeDisplay('display-1', displayCtrl.controller);
        broker.subscribeQueue('queue-1', queueCtrl.controller);
        await broker.broadcastDisplayCall('A001', 'Q1', 'Nguyễn Văn A', 'A002');

        // Display client: đầy đủ, có customerName + nextTicketNumber
        const displayEvent = parseEvent(received(displayCtrl.controller)) as Record<string, unknown>;
        expect(displayEvent).toEqual({
            type: 'DISPLAY_CALL',
            ticketNumber: 'A001',
            pos: 'Q1',
            customerName: 'Nguyễn Văn A',
            nextTicketNumber: 'A002',
        });

        // Queue client: KHÔNG có customerName (tránh lộ PII cho queue anonymous)
        const queueEvent = parseEvent(received(queueCtrl.controller)) as Record<string, unknown>;
        expect(queueEvent).toEqual({
            type: 'DISPLAY_CALL',
            ticketNumber: 'A001',
            pos: 'Q1',
            nextTicketNumber: 'A002',
        });
        expect(queueEvent.customerName).toBeUndefined();
    });

    it('gọi redis.publish đúng channel DISPLAY_CALL', async () => {
        const broker = createBroker();
        await broker.broadcastDisplayCall('A001', 'Q1', 'Nguyễn Văn A');

        expect(mockedRedis.publish).toHaveBeenCalledWith(
            'display:calls',
            JSON.stringify({ ticketNumber: 'A001', pos: 'Q1', customerName: 'Nguyễn Văn A', nextTicketNumber: undefined })
        );
    });
});

describe('controller.enqueue ném lỗi → client bị gỡ', () => {
    it('queue client bị unsubscribe khi enqueue throw', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        enqueueMock.mockImplementation(() => {
            throw new Error('stream closed');
        });
        mockedPrisma.ticket.findMany.mockResolvedValue([{ id: 't1', serviceId: 'svc-1' }]);

        broker.subscribeQueue('client-1', controller);
        await broker.broadcastQueueUpdate();
        expect(enqueueMock).toHaveBeenCalledTimes(1);

        // Lần broadcast sau: client đã bị gỡ, không enqueue nữa
        await broker.broadcastQueueUpdate();
        expect(enqueueMock).toHaveBeenCalledTimes(1);
    });

    it('display client bị unsubscribe khi enqueue throw', async () => {
        const broker = createBroker();
        const { controller } = makeController();
        const enqueueMock = (controller as unknown as { enqueue: ReturnType<typeof vi.fn> }).enqueue;
        enqueueMock.mockImplementation(() => {
            throw new Error('stream closed');
        });

        broker.subscribeDisplay('display-1', controller);
        await broker.broadcastDisplayCall('A001', 'Q1');
        expect(enqueueMock).toHaveBeenCalledTimes(1);

        await broker.broadcastDisplayCall('A001', 'Q1');
        expect(enqueueMock).toHaveBeenCalledTimes(1);
    });

    it('logger.error được gọi khi redis.publish thất bại', async () => {
        const broker = createBroker();
        mockedRedis.publish.mockRejectedValue(new Error('Redis down'));

        await broker.broadcastQueueUpdate('svc-1');

        expect(logger.error).toHaveBeenCalled();
    });
});
