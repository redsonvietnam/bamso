import crypto from 'crypto';
import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';
import { writeAuditLog, AuditActor } from '@/lib/audit-service';
import { getBusinessDayBounds, getBusinessDayKey } from '@/lib/business-day';

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
    return getBusinessDayBounds();
}

function getDayKey(date: Date): string {
    return getBusinessDayKey(date);
}

export class IdempotencyConflictError extends Error {
    readonly code = 'IDEMPOTENCY_CONFLICT';
    readonly status = 409;

    constructor() {
        super('Idempotency-Key đã được sử dụng cho một thao tác khác.');
    }
}

export interface DisplayEvent {
    eventId: string;
    serviceId: string;
    ticketNumber: string;
    pos: string;
    customerName?: string | null;
    nextTicketNumber?: string;
}

export interface CallNextOptions {
    // Client-supplied key for one logical CALL-NEXT operation. Absent key =
    // legacy path with no idempotency record. Present key = the key row is
    // reserved atomically inside the same transaction as the queue mutation.
    idempotencyKey?: string;
}

function callNextFingerprint(serviceId: string, pos: string, actor?: AuditActor): string {
    return JSON.stringify({
        serviceId,
        pos,
        actorId: actor?.actorId ?? null,
        actorRole: actor?.actorRole ?? null,
    });
}

// True only for a unique-key collision on the CallNextIdempotency primary
// key (probed shape: { code: 'P2002', meta: { modelName:
// 'CallNextIdempotency', target: ['key'] } }). Any other Prisma error,
// including P2002 on other tables, is a genuine unrelated error and must
// propagate untouched.
function isIdempotencyKeyConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as { code?: unknown; meta?: unknown };
    if (record.code !== 'P2002') return false;
    const meta = record.meta as { modelName?: unknown; target?: unknown } | undefined;
    if (meta?.modelName !== 'CallNextIdempotency') return false;
    const target = meta?.target;
    if (Array.isArray(target)) return target.includes('key');
    if (typeof target === 'string') return target === 'key' || target.includes('CallNextIdempotency');
    return false;
}

/**
 * Calls the next pending ticket for a given service at a specific counter.
 * Uses a per-counter lock plus conditional updateMany to prevent race conditions.
 *
 * Idempotency (WP-CORE-04): when options.idempotencyKey is present, the key
 * row is created in the same transaction as the claim. A retry carrying the
 * same key and fingerprint replays the original claimed ticket without a
 * second mutation or audit; the same key with a different fingerprint is
 * rejected with IdempotencyConflictError and zero mutation. The service is
 * the authority on replay: the result carries replayed=true only when no
 * mutation happened in this call.
 */
export async function callNextTicket(serviceId: string, pos: string, actor?: AuditActor, options?: CallNextOptions) {
    const idempotencyKey = options?.idempotencyKey;
    const fingerprint = idempotencyKey ? callNextFingerprint(serviceId, pos, actor) : null;
    return withPosLock(pos, async () => {
        const { startOfDay, endOfDay } = getTodayBounds();
        const dayKey = getDayKey(new Date());

        for (let attempt = 0; attempt < MAX_CALL_RETRIES; attempt++) {
            try {
                const result = await prisma.$transaction(async (tx) => {
                    if (idempotencyKey && fingerprint) {
                    const existing =
                        typeof tx.callNextIdempotency?.findUnique === 'function'
                            ? await tx.callNextIdempotency.findUnique({ where: { key: idempotencyKey } })
                            : null;
                    if (existing) {
                        if (existing.fingerprint !== fingerprint) {
                            throw new IdempotencyConflictError();
                        }
                        if (!existing.ticketId) {
                            throw new Error('Bản ghi idempotency không nhất quán.');
                        }
                        const replayed = await tx.ticket.findUnique({
                            where: { id: existing.ticketId },
                            include: { service: true },
                        });
                        if (!replayed) {
                            throw new Error('Bản ghi idempotency không nhất quán.');
                        }
                        return { claimed: true as const, ticket: replayed, replayed: true as const, displayEvent: undefined };
                    }
                    await tx.callNextIdempotency.create({
                        data: { key: idempotencyKey, fingerprint },
                    });
                }

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
                    if (idempotencyKey) {
                        // Release this attempt's key reservation so the retry
                        // starts clean; the committed transaction carries no
                        // trace of the unclaimed attempt.
                        await tx.callNextIdempotency.deleteMany({ where: { key: idempotencyKey } });
                    }
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

                // CORE-06: Persist display call event atomically with the
                // business mutation. The event is the canonical record of
                // the customer-facing notification that was created by this
                // successful CALL-NEXT.
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

                const maxSeq = await tx.displayCallEvent.aggregate({
                    where: { createdAt: { gte: startOfDay, lte: endOfDay } },
                    _max: { sequence: true },
                });
                const sequence = (maxSeq._max.sequence ?? 0) + 1;

                const displayEventId = crypto.randomUUID();
                await tx.displayCallEvent.create({
                    data: {
                        eventId: displayEventId,
                        callNextKey: idempotencyKey ?? null,
                        ticketId: nextTicket.id,
                        ticketNumber: nextTicket.ticketNumber,
                        serviceId,
                        pos,
                        customerName: nextTicket.customerName,
                        nextTicketNumber: nextInQueue?.ticketNumber ?? null,
                        sequence,
                        status: 'PENDING',
                    },
                });

                const claimedTicket = await tx.ticket.findUnique({
                    where: { id: nextTicket.id },
                    include: { service: true },
                });
                if (idempotencyKey) {
                    // Seal the reservation with the canonical outcome inside
                    // the same transaction as the claim and its audit record.
                    await tx.callNextIdempotency.update({
                        where: { key: idempotencyKey },
                        data: { ticketId: nextTicket.id, ticketNumber: nextTicket.ticketNumber },
                    });
                }

                return {
                    claimed: true as const,
                    ticket: claimedTicket,
                    replayed: false as const,
                    displayEvent: {
                        eventId: displayEventId,
                        serviceId,
                        ticketNumber: nextTicket.ticketNumber,
                        pos,
                        customerName: nextTicket.customerName,
                        nextTicketNumber: nextInQueue?.ticketNumber ?? null,
                    },
                };
                }, { timeout: 15000 });

                if (result.claimed) {
                    return { ticket: result.ticket, replayed: result.replayed, displayEvent: result.displayEvent };
                }
            } catch (error) {
                // Unique-key collision on the idempotency reservation: an
                // independent execution context committed the same key first.
                // Prisma already rolled our transaction back completely (no
                // partial mutation, no orphan row, no audit), so retrying
                // observes the winner's committed row and replays it.
                if (isIdempotencyKeyConflict(error) && attempt < MAX_CALL_RETRIES - 1) {
                    continue;
                }
                throw error;
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

                await tx.ticket.updateMany({
                    where: {
                        serviceId: ticket.serviceId,
                        status: TicketStatus.PENDING,
                        dayKey,
                        position: { gte: targetPos },
                        id: { not: ticketId },
                        createdAt: { gte: startOfDay, lte: endOfDay },
                    },
                    data: { position: { increment: 1 } },
                });
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
