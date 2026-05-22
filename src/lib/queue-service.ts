import prisma from '@/lib/db';
import { TicketStatus } from '@/lib/constants';

/**
 * Helper to get the start and end of the current day.
 */
function getTodayBounds() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startOfDay, endOfDay };
}

/**
 * Calls the next pending ticket for a given service at a specific counter (pos).
 * Automatically completes any tickets currently being called/processed at this counter today.
 */
export async function callNextTicket(serviceId: string, pos: string) {
    const { startOfDay, endOfDay } = getTodayBounds();

    return await prisma.$transaction(async (tx) => {
        // 1. Automatically complete previous tickets active at this counter today
        await tx.ticket.updateMany({
            where: {
                pos,
                status: { in: [TicketStatus.CALLED, TicketStatus.IN_PROGRESS] },
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            data: {
                status: TicketStatus.COMPLETED,
                completedAt: new Date(),
            },
        });

        // 2. Find the next pending ticket for this service today, ordered by position
        const nextTicket = await tx.ticket.findFirst({
            where: {
                serviceId,
                status: TicketStatus.PENDING,
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            orderBy: {
                position: 'asc',
            },
        });

        if (!nextTicket) {
            throw new Error('Không còn số thứ tự nào đang chờ cho dịch vụ này.');
        }

        // 3. Update status to CALLED
        return await tx.ticket.update({
            where: { id: nextTicket.id },
            data: {
                status: TicketStatus.CALLED,
                calledAt: new Date(),
                pos,
            },
            include: {
                service: true,
            },
        });
    }, { timeout: 15000 });
}

/**
 * Completes a ticket currently being served.
 */
export async function completeTicket(ticketId: string) {
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
    });

    if (!ticket) {
        throw new Error('Không tìm thấy phiếu yêu cầu.');
    }

    if (ticket.status !== TicketStatus.CALLED && ticket.status !== TicketStatus.IN_PROGRESS) {
        throw new Error('Vé không ở trạng thái đang phục vụ để hoàn thành.');
    }

    return await prisma.ticket.update({
        where: { id: ticketId },
        data: {
            status: TicketStatus.COMPLETED,
            completedAt: new Date(),
        },
        include: {
            service: true,
        },
    });
}

/**
 * Skips a ticket. Moves it back into the queue according to configured skip_rules
 * or marks it as MISSED if skip limit is exceeded.
 */
export async function skipTicket(ticketId: string) {
    const { startOfDay, endOfDay } = getTodayBounds();

    return await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
            where: { id: ticketId },
        });

        if (!ticket) {
            throw new Error('Không tìm thấy phiếu yêu cầu.');
        }

        if (ticket.status !== TicketStatus.CALLED && ticket.status !== TicketStatus.IN_PROGRESS) {
            throw new Error('Vé không ở trạng thái đang phục vụ để bỏ qua.');
        }

        const newMissCount = ticket.missCount + 1;

        // Fetch skip_rules settings
        const skipRulesSetting = await tx.settings.findUnique({
            where: { key: 'skip_rules' },
        });
        const skipRules = skipRulesSetting ? skipRulesSetting.value.split(',') : ['1', '3', '5', 'MISSED'];

        // Determine the rule for the current skip count
        const ruleIndex = newMissCount - 1;
        const currentRule = skipRules[ruleIndex] || 'MISSED';

        if (currentRule === 'MISSED') {
            // Mark as MISSED
            return await tx.ticket.update({
                where: { id: ticketId },
                data: {
                    status: TicketStatus.MISSED,
                    missCount: newMissCount,
                },
                include: {
                    service: true,
                },
            });
        }

        // Parse how many pending tickets to push back by
        const pushBackBy = parseInt(currentRule, 10) || 1;

        // Get other pending tickets for the same service today (excluding current ticket)
        const pendingTickets = await tx.ticket.findMany({
            where: {
                serviceId: ticket.serviceId,
                status: TicketStatus.PENDING,
                id: { not: ticketId },
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            orderBy: {
                position: 'asc',
            },
        });

        let targetPos = 1;

        if (pendingTickets.length === 0) {
            // No other pending tickets, position stays 1 or max position + 1
            const maxPosResult = await tx.ticket.aggregate({
                where: {
                    serviceId: ticket.serviceId,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
                _max: {
                    position: true,
                },
            });
            targetPos = (maxPosResult._max.position || 0) + 1;
        } else if (pendingTickets.length <= pushBackBy) {
            // Place at the very end
            targetPos = pendingTickets[pendingTickets.length - 1].position + 1;
        } else {
            // Insert after pushBackBy pending tickets
            const targetTicket = pendingTickets[pushBackBy - 1];
            targetPos = targetTicket.position + 1;

            // Shift positions of subsequent pending tickets
            await tx.ticket.updateMany({
                where: {
                    serviceId: ticket.serviceId,
                    status: TicketStatus.PENDING,
                    position: { gte: targetPos },
                    id: { not: ticketId },
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
                data: {
                    position: { increment: 1 },
                },
            });
        }

        // Return the ticket to PENDING state at targetPos
        return await tx.ticket.update({
            where: { id: ticketId },
            data: {
                status: TicketStatus.PENDING,
                missCount: newMissCount,
                position: targetPos,
                pos: null,
                calledAt: null,
            },
            include: {
                service: true,
            },
        });
    }, { timeout: 15000 });
}

/**
 * Restores a MISSED ticket to the front of the PENDING queue.
 */
export async function restoreTicket(ticketId: string) {
    const { startOfDay, endOfDay } = getTodayBounds();

    return await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
            where: { id: ticketId },
        });

        if (!ticket) {
            throw new Error('Không tìm thấy phiếu yêu cầu.');
        }

        if (ticket.status !== TicketStatus.MISSED) {
            throw new Error('Chỉ có thể khôi phục các vé ở trạng thái nhỡ lượt.');
        }

        // Find the minimum position of currently pending tickets today
        const minPosResult = await tx.ticket.aggregate({
            where: {
                serviceId: ticket.serviceId,
                status: TicketStatus.PENDING,
                createdAt: { gte: startOfDay, lte: endOfDay },
            },
            _min: {
                position: true,
            },
        });

        // Set position to min - 1 so it is called first next time
        const newPos = minPosResult._min.position !== null ? minPosResult._min.position - 1 : 1;

        return await tx.ticket.update({
            where: { id: ticketId },
            data: {
                status: TicketStatus.PENDING,
                position: newPos,
                missCount: 0, // Reset miss count on restore
                pos: null,
                calledAt: null,
                completedAt: null,
            },
            include: {
                service: true,
            },
        });
    }, { timeout: 15000 });
}
