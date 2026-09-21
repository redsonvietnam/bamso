// CORE-06: Production recovery function for pending display call events.
// Single implementation used by:
//   - /api/sse/display (production endpoint)
//   - Redis failure tests (verification)
//   - Process-boundary tests (verification)
//
// ═══════════════════════════════════════════════════════════════════
// ORDERING CONTRACT — DISPLAY CALL RECOVERY
// ═══════════════════════════════════════════════════════════════════
//
// Recovery guarantees DETERMINISTIC, STABLE presentation order.
// It does NOT claim causal ordering between concurrent CALL-NEXT
// operations across counters.
//
// Order: createdAt ASC, then id ASC.
//
// Rationale:
// - createdAt captures wall-clock time of the CALL-NEXT transaction
// - id (UUID) breaks ties when createdAt is identical (same millisecond)
// - Concurrent calls to different counters are independent business actions
// - The display shows all calls in a stable, predictable order
// - Same events always produce same order (deterministic)
// - Repeated recovery yields same result (stable)
//
// This is NOT "canonical CALL-NEXT order" — it is presentation order.
// The business requires that all calls are shown and the order is
// consistent across reconnects, not that concurrent cross-counter
// calls appear in exact causal sequence.
// ═══════════════════════════════════════════════════════════════════

import prisma from '@/lib/db';
import { getBusinessDayBounds } from '@/lib/business-day';

export type RecoveredDisplayEvent = {
    eventId: string;
    ticketNumber: string;
    pos: string;
    customerName: string | null;
    nextTicketNumber: string | null;
};

/**
 * Recover pending display call events for today.
 *
 * Returns the events to deliver AND a markDelivered function.
 * The caller MUST:
 *   1. Emit/enqueue the events (SSE controller.enqueue, test capture, etc.)
 *   2. Call markDelivered() after successful emission
 *
 * If the process crashes between step 1 and step 2, events stay PENDING
 * and will be re-sent on next reconnect (at-least-once delivery).
 *
 * @param serviceId - optional filter for a specific service
 * @returns events to deliver + markDelivered callback
 */
export async function recoverPendingDisplayEvents(serviceId?: string) {
    const { startOfDay, endOfDay } = getBusinessDayBounds(new Date());

    const pendingEvents = await prisma.displayCallEvent.findMany({
        where: {
            status: 'PENDING',
            createdAt: { gte: startOfDay, lte: endOfDay },
            ...(serviceId && { serviceId }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const events: RecoveredDisplayEvent[] = pendingEvents.map((e) => ({
        eventId: e.eventId,
        ticketNumber: e.ticketNumber,
        pos: e.pos,
        customerName: e.customerName,
        nextTicketNumber: e.nextTicketNumber,
    }));

    async function markDelivered() {
        if (pendingEvents.length > 0) {
            await prisma.displayCallEvent.updateMany({
                where: { id: { in: pendingEvents.map((e) => e.id) } },
                data: { status: 'DELIVERED' },
            });
        }
    }

    return { events, markDelivered };
}
