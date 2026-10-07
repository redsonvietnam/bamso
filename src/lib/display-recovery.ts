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

export type DisplayCallState = {
    currentCalls: Record<string, { ticketNumber: string; pos: string; customerName?: string | null; timestamp: number }>;
    lastCalledTicket: { ticketNumber: string; pos: string; customerName?: string | null; timestamp: number } | null;
    counters: string[];
};

export function shouldAnnounceDisplayEvent(historicalReplay: boolean | undefined): boolean {
    return historicalReplay !== true;
}

export function applyDisplayCallEvent(
    state: DisplayCallState,
    event: Pick<RecoveredDisplayEvent, 'ticketNumber' | 'pos' | 'customerName'>,
    timestamp: number,
): DisplayCallState {
    const newCall = {
        ticketNumber: event.ticketNumber,
        pos: event.pos,
        customerName: event.customerName,
        timestamp,
    };
    return {
        currentCalls: { ...state.currentCalls, [event.pos]: newCall },
        lastCalledTicket: newCall,
        counters: state.counters.includes(event.pos)
            ? state.counters
            : [...state.counters, event.pos].sort(),
    };
}

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
