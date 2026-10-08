import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';

const MAX_CALL_RETRIES = 5;

function createMutex() {
    const locks = new Map<string, Promise<void>>();

    return async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const previous = locks.get(key) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });

        locks.set(key, current);
        await previous;

        try {
            return await fn();
        } finally {
            release();
            if (locks.get(key) === current) {
                locks.delete(key);
            }
        }
    };
}

// Serialize call-next operations per counter. This prevents a concurrent request
// on the same counter from auto-completing the ticket just claimed by the first
// request. Different counters remain independent and can proceed concurrently.
const withPosLock = createMutex();

// Serialize operations that mutate queue positions for the same service.
// This lock is shared by skip and restore because both read the current queue
// and then derive a new position from that snapshot.
const withServiceQueueLock = createMutex();

function getTodayBounds() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startOfDay, endOfDay };
}

function getDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export interface DisplayEvent {
    eventId: string;
    ticketId: string;
    ticketNumber: string;
    serviceId: string;
    pos: string;
    customerName?: string | null;
    nextTicketNumber?: string | null;
}

interface CallNextDisplayEventOptions {
    includeDisplayEvent: true;
}

type TicketWithService = Prisma.TicketGetPayload<{ include: { service: true } }>;

/**
 * Calls the next pending ticket for a given service at a specific counter.
 * Uses a per-counter lock plus conditional updateMany to prevent race conditions.
 */
export async function callNextTicket(serviceId: string, pos: string, actor?: AuditActor): Promise<TicketWithService>;
export async function callNextTicket(
    serviceId: string,
    pos: string,
    actor: AuditActor | undefined,
    options: CallNextDisplayEventOptions
): Promise<{
    ticket: TicketWithService;
    displayEvent: Prisma.DisplayCallEventGetPayload<Prisma.DisplayCallEventDefaultArgs>;
}>;
export async function callNextTicket(serviceId: string, pos: string, actor?: AuditActor, options?: CallNextDisplayEventOptions) {
    return withPosLock(pos, async () => {
        const { startOfDay, endOfDay } = getTodayBounds();
        const dayKey = getDayKey(new Date());

        for (let attempt = 0; attempt < MAX_CALL_RETRIES; attempt++) {
            const result = await prisma.$transaction(async (tx) => {
                const autoCompleted = typeof tx.ticket.findMany === 'function'
                    ? await tx.ticket.findMany({
                          where: {
                              pos,
                              status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
                              dayKey,
                              createdAt: { gte: startOfDay, lte: endOfDay },
                          },
                          select: { id: true },
                      })
                    : [];

                await tx.ticket.updateMany({
                    where: {
                        pos,
                        status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
                        dayKey,
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    data: {
                        status: TicketStatus.COMPLETED,
                        completedAt: new Date(),
                    },
                });

                const nextTicket = await tx.ticket.findFirst({
                    where: {
                        serviceId,
                        status: TicketStatus.PENDING,
                        dayKey,
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    orderBy: { position: 'asc' },
                });

                if (!nextTicket) {
                    throw new Error('Không còn số thứ tự nào đang chờ cho dịch vụ này.');
                }

                const claimResult = await tx.ticket.updateMany({
                    where: {
                        id: nextTicket.id,
                        status: TicketStatus.PENDING,
                    },
                    data: {
                        status: TicketStatus.CALLED,
                        calledAt: new Date(),
                        pos,
                    },
                });

                if (claimResult.count === 0) {
                    return { claimed: false as const };
                }

                const autoCompletedTicketId = Array.isArray(autoCompleted) && autoCompleted.length > 0
                    ? autoCompleted[0]?.id
                    : undefined;
                await writeAuditLog(tx, {
                    actor: actor ?? { actorType: 'SYSTEM' },
                    action: 'CALL_NEXT',
                    entityType: 'TICKET',
                    entityId: nextTicket.id,
                    success: true,
                    metadata: {
                        counter: pos,
                        ...(autoCompletedTicketId ? { autoCompletedTicketId } : {}),
                    },
                });

                const nextInQueue = await tx.ticket.findFirst({
                    where: {
                        serviceId,
                        status: TicketStatus.PENDING,
                        dayKey,
                        createdAt: { gte: startOfDay, lte: endOfDay },
                        id: { not: nextTicket.id },
                    },
                    orderBy: { position: 'asc' },
                });

                const displayEvent = await tx.displayCallEvent.create({
                    data: {
                        eventId: crypto.randomUUID(),
                        ticketId: nextTicket.id,
                        ticketNumber: nextTicket.ticketNumber,
                        serviceId,
                        pos,
                        customerName: nextTicket.customerName,
                        nextTicketNumber: nextInQueue?.ticketNumber ?? null,
                        status: 'PENDING',
                    },
                });

                return {
                    claimed: true as const,
                    ticket: await tx.ticket.findUnique({
                        where: { id: nextTicket.id },
                        include: { service: true },
                    }),
                    displayEvent,
                };
            }, { timeout: 15000 });

            if (result.claimed) {
                return options?.includeDisplayEvent
                    ? { ticket: result.ticket, displayEvent: result.displayEvent }
                    : result.ticket;
            }
        }

        throw new Error('Không thể gọi vé — hệ thống đang quá tải, vui lòng thử lại.');
    });
}

/**
 * Completes a ticket atomically: combines status check and update into one operation.
 */
export async function completeTicket(ticketId: string, actor?: AuditActor) {
    return prisma.$transaction(async (tx) => {
        const result = await tx.ticket.updateMany({
            where: {
                id: ticketId,
                status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
            },
            data: {
                status: TicketStatus.COMPLETED,
                completedAt: new Date(),
            },
        });

        if (result.count === 0) {
            const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
            if (!ticket) throw new Error('Không tìm thấy phiếu yêu cầu.');
            throw new Error('Vé không ở trạng thái đang phục vụ để hoàn thành.');
        }

        await writeAuditLog(tx, {
            actor: actor ?? { actorType: 'SYSTEM' },
            action: 'COMPLETE',
            entityType: 'TICKET',
            entityId: ticketId,
            success: true,
        });

        return tx.ticket.findUnique({
            where: { id: ticketId },
            include: { service: true },
        });
    }, { timeout: 15000 });
}

/**
 * Skips a ticket with guard against concurrent state changes.
 */
export async function skipTicket(ticketId: string, actor?: AuditActor) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });

    if (!ticket) throw new Error('Không tìm thấy phiếu yêu cầu.');
    if (ticket.status !== TicketStatus.CALLED && ticket.status !== TicketStatus.IN_PROGRESS) {
        throw new Error('Vé không ở trạng thái đang phục vụ để bỏ qua.');
    }

    return withServiceQueueLock(ticket.serviceId, async () => {
        const { startOfDay, endOfDay } = getTodayBounds();
        const dayKey = getDayKey(new Date());

        return prisma.$transaction(async (tx) => {
            const expectedStatus = ticket.status;
            const newMissCount = ticket.missCount + 1;

            const skipRulesSetting = await tx.settings.findUnique({ where: { key: 'skip_rules' } });
            const skipRules = skipRulesSetting ? skipRulesSetting.value.split(',') : ['1', '3', '5', 'MISSED'];

            const ruleIndex = newMissCount - 1;
            const currentRule = skipRules[ruleIndex] || 'MISSED';

            if (currentRule === 'MISSED') {
                const result = await tx.ticket.updateMany({
                    where: { id: ticketId, status: expectedStatus },
                    data: { status: TicketStatus.MISSED, missCount: newMissCount },
                });
                if (result.count === 0) throw new Error('Trạng thái vé đã thay đổi, vui lòng thử lại.');

                await writeAuditLog(tx, {
                    actor: actor ?? { actorType: 'SYSTEM' },
                    action: 'SKIP',
                    entityType: 'TICKET',
                    entityId: ticketId,
                    success: true,
                });

                return tx.ticket.findUnique({ where: { id: ticketId }, include: { service: true } });
            }

            const pushBackBy = parseInt(currentRule, 10) || 1;

            const pendingTickets = await tx.ticket.findMany({
                where: {
                    serviceId: ticket.serviceId,
                    status: TicketStatus.PENDING,
                    dayKey,
                    id: { not: ticketId },
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
                orderBy: { position: 'asc' },
            });

            let targetPos = 1;

            if (pendingTickets.length === 0) {
                const maxPosResult = await tx.ticket.aggregate({
                    where: { serviceId: ticket.serviceId, dayKey, createdAt: { gte: startOfDay, lte: endOfDay } },
                    _max: { position: true },
                });
                targetPos = (maxPosResult._max.position || 0) + 1;
            } else if (pendingTickets.length <= pushBackBy) {
                targetPos = pendingTickets[pendingTickets.length - 1].position + 1;
            } else {
                const targetTicket = pendingTickets[pushBackBy - 1];
                targetPos = targetTicket.position + 1;

                // Shift row-by-row in DESCENDING position order. A bulk
                // `position + 1` update makes SQLite check the
                // (serviceId, dayKey, position) unique index per row and can
                // throw P2002 on a transient duplicate before the higher row
                // has moved out of the way.
                const toShift = pendingTickets
                    .filter((t) => t.position >= targetPos)
                    .sort((a, b) => b.position - a.position);
                for (const pending of toShift) {
                    await tx.ticket.updateMany({
                        where: {
                            id: pending.id,
                            status: TicketStatus.PENDING,
                            serviceId: ticket.serviceId,
                            dayKey,
                        },
                        data: { position: pending.position + 1 },
                    });
                }
            }

            const result = await tx.ticket.updateMany({
                where: { id: ticketId, status: expectedStatus },
                data: {
                    status: TicketStatus.PENDING,
                    missCount: newMissCount,
                    position: targetPos,
                    pos: null,
                    calledAt: null,
                },
            });
            if (result.count === 0) throw new Error('Trạng thái vé đã thay đổi, vui lòng thử lại.');

            await writeAuditLog(tx, {
                actor: actor ?? { actorType: 'SYSTEM' },
                action: 'SKIP',
                entityType: 'TICKET',
                entityId: ticketId,
                success: true,
            });

            return tx.ticket.findUnique({ where: { id: ticketId }, include: { service: true } });
        }, { timeout: 15000 });
    });
}

/**
 * Restores a MISSED ticket with guard against concurrent state changes.
 */
export async function restoreTicket(ticketId: string, actor?: AuditActor) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });

    if (!ticket) throw new Error('Không tìm thấy phiếu yêu cầu.');
    if (ticket.status !== TicketStatus.MISSED) {
        throw new Error('Chỉ có thể khôi phục các vé ở trạng thái nhỡ lượt.');
    }

    return withServiceQueueLock(ticket.serviceId, async () => {
        const { startOfDay, endOfDay } = getTodayBounds();
        const dayKey = getDayKey(new Date());

        return prisma.$transaction(async (tx) => {
            const expectedStatus = ticket.status;

            const minPosResult = await tx.ticket.aggregate({
                where: {
                    serviceId: ticket.serviceId,
                    status: TicketStatus.PENDING,
                    dayKey,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
                _min: { position: true },
            });

            let newPos = 1;

            if (minPosResult._min.position === null) {
                newPos = 1;
            } else if (minPosResult._min.position > 1) {
                newPos = minPosResult._min.position - 1;
            } else {
                const maxPosResult = await tx.ticket.aggregate({
                    where: {
                        serviceId: ticket.serviceId,
                        dayKey,
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    _max: { position: true },
                });
                const offset = Math.max(1, (maxPosResult._max.position || 0) + 1);

                await tx.ticket.updateMany({
                    where: {
                        serviceId: ticket.serviceId,
                        status: TicketStatus.PENDING,
                        dayKey,
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    data: { position: { increment: offset } },
                });

                await tx.ticket.updateMany({
                    where: {
                        serviceId: ticket.serviceId,
                        status: TicketStatus.PENDING,
                        dayKey,
                        position: { gte: 1 + offset },
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    data: { position: { decrement: offset - 1 } },
                });

                newPos = 1;
            }

            const result = await tx.ticket.updateMany({
                where: { id: ticketId, status: expectedStatus },
                data: {
                    status: TicketStatus.PENDING,
                    position: newPos,
                    missCount: 0,
                    pos: null,
                    calledAt: null,
                    completedAt: null,
                },
            });
            if (result.count === 0) throw new Error('Trạng thái vé đã thay đổi, vui lòng thử lại.');

            await writeAuditLog(tx, {
                actor: actor ?? { actorType: 'SYSTEM' },
                action: 'RESTORE',
                entityType: 'TICKET',
                entityId: ticketId,
                success: true,
            });

            return tx.ticket.findUnique({ where: { id: ticketId }, include: { service: true } });
        }, { timeout: 15000 });
    });
}
