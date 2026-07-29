import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';

const MAX_CALL_RETRIES = 5;

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

/**
 * Calls the next pending ticket for a given service at a specific counter.
 * Uses conditional updateMany to prevent race conditions (two counters calling same ticket).
 */
export async function callNextTicket(serviceId: string, pos: string) {
    const { startOfDay, endOfDay } = getTodayBounds();
    const dayKey = getDayKey(new Date());

    for (let attempt = 0; attempt < MAX_CALL_RETRIES; attempt++) {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Auto-complete any active tickets at this counter today
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

            // 2. Find next pending ticket
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

            // 3. Conditional claim: only update if still PENDING (prevents race condition)
            const claimResult = await tx.ticket.updateMany({
                where: {
                    id: nextTicket.id,
                    status: TicketStatus.PENDING, // Atomic claim condition
                },
                data: {
                    status: TicketStatus.CALLED,
                    calledAt: new Date(),
                    pos,
                },
            });

            // If claim failed (count === 0), another counter grabbed it — retry
            if (claimResult.count === 0) {
                return { claimed: false };
            }

            // Return the claimed ticket
            return {
                claimed: true,
                ticket: await tx.ticket.findUnique({
                    where: { id: nextTicket.id },
                    include: { service: true },
                }),
            };
        }, { timeout: 15000 });

        if (result.claimed) {
            return result.ticket;
        }
        // Retry if claim failed
    }

    throw new Error('Không thể gọi vé — hệ thống đang quá tải, vui lòng thử lại.');
}

/**
 * Completes a ticket atomically: combines status check and update into one operation.
 */
export async function completeTicket(ticketId: string) {
    const result = await prisma.ticket.updateMany({
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
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error('Không tìm thấy phiếu yêu cầu.');
        throw new Error('Vé không ở trạng thái đang phục vụ để hoàn thành.');
    }

    return prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { service: true },
    });
}

/**
 * Skips a ticket with guard against concurrent state changes.
 */
export async function skipTicket(ticketId: string) {
    const { startOfDay, endOfDay } = getTodayBounds();
    const dayKey = getDayKey(new Date());

    return await prisma.$transaction(async (tx) => {
        // 1. Read current state
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });

        if (!ticket) throw new Error('Không tìm thấy phiếu yêu cầu.');
        if (ticket.status !== TicketStatus.CALLED && ticket.status !== TicketStatus.IN_PROGRESS) {
            throw new Error('Vé không ở trạng thái đang phục vụ để bỏ qua.');
        }

        const expectedStatus = ticket.status;
        const newMissCount = ticket.missCount + 1;

        // 2. Fetch skip rules
        const skipRulesSetting = await tx.settings.findUnique({ where: { key: 'skip_rules' } });
        const skipRules = skipRulesSetting ? skipRulesSetting.value.split(',') : ['1', '3', '5', 'MISSED'];

        const ruleIndex = newMissCount - 1;
        const currentRule = skipRules[ruleIndex] || 'MISSED';

        if (currentRule === 'MISSED') {
            // Guard: status must still match what we read
            const result = await tx.ticket.updateMany({
                where: { id: ticketId, status: expectedStatus },
                data: { status: TicketStatus.MISSED, missCount: newMissCount },
            });
            if (result.count === 0) throw new Error('Trạng thái vé đã thay đổi, vui lòng thử lại.');
            return tx.ticket.findUnique({ where: { id: ticketId }, include: { service: true } });
        }

        const pushBackBy = parseInt(currentRule, 10) || 1;

        // 3. Get other pending tickets for the same service today
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

        // 4. Guard: status must still match what we read
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

        return tx.ticket.findUnique({ where: { id: ticketId }, include: { service: true } });
    }, { timeout: 15000 });
}

/**
 * Restores a MISSED ticket with guard against concurrent state changes.
 */
export async function restoreTicket(ticketId: string) {
    const { startOfDay, endOfDay } = getTodayBounds();
    const dayKey = getDayKey(new Date());

    return await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });

        if (!ticket) throw new Error('Không tìm thấy phiếu yêu cầu.');
        if (ticket.status !== TicketStatus.MISSED) {
            throw new Error('Chỉ có thể khôi phục các vé ở trạng thái nhỡ lượt.');
        }

        const expectedStatus = ticket.status;

        // Find minimum position of pending tickets today
        const minPosResult = await tx.ticket.aggregate({
            where: {
                serviceId: ticket.serviceId,
                status: TicketStatus.PENDING,
                dayKey,
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            _min: { position: true },
        });

        const newPos = minPosResult._min.position !== null ? minPosResult._min.position - 1 : 1;

        // Guard: status must still match
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

        return tx.ticket.findUnique({ where: { id: ticketId }, include: { service: true } });
    }, { timeout: 15000 });
}
