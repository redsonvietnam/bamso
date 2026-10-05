import prisma from '@/lib/db';

function getBusinessDayBounds() {
    const now = new Date();
    return {
        startOfDay: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        endOfDay: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    };
}

export type RecoveredDisplayEvent = {
    id: string;
    eventId: string;
    ticketNumber: string;
    pos: string;
    customerName: string | null;
    nextTicketNumber: string | null;
};

/**
 * CORE-06: recover today's pending display events in deterministic presentation order.
 * The caller must emit the returned events before calling markDelivered().
 */
export async function recoverPendingDisplayEvents() {
    const { startOfDay, endOfDay } = getBusinessDayBounds();
    const pendingEvents = await prisma.displayCallEvent.findMany({
        where: {
            status: 'PENDING',
            createdAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const events = pendingEvents.map((event) => ({
        id: event.id,
        eventId: event.eventId,
        ticketNumber: event.ticketNumber,
        pos: event.pos,
        customerName: event.customerName,
        nextTicketNumber: event.nextTicketNumber,
    }));

    const markDelivered = async () => {
        if (pendingEvents.length === 0) return;
        await prisma.displayCallEvent.updateMany({
            where: { id: { in: pendingEvents.map((event) => event.id) } },
            data: { status: 'DELIVERED' },
        });
    };

    return { events, markDelivered };
}
