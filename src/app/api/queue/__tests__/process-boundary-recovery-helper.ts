// CORE-06 process-boundary recovery helper: called via child_process.fork()
// Invokes the PRODUCTION recovery function (display-recovery.ts) to prove
// that recovery works across process boundaries through real production code.
// Prints the result as JSON for the parent process to assert.

import { PrismaClient } from '@prisma/client';
import { recoverPendingDisplayEvents } from '@/lib/display-recovery';

const prisma = new PrismaClient();

async function main() {
    const serviceId = process.argv[2];
    if (!serviceId) {
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({ error: 'Missing serviceId argument' }));
        process.exit(1);
    }

    // Invoke the PRODUCTION recovery function — same code path as /api/sse/display
    const { events, markDelivered } = await recoverPendingDisplayEvents(serviceId);

    // "Deliver" each event (in production: controller.enqueue SSE payload)
    const delivered = events.map((e) => ({
        eventId: e.eventId,
        ticketNumber: e.ticketNumber,
        pos: e.pos,
        customerName: e.customerName,
        nextTicketNumber: e.nextTicketNumber,
    }));

    // Mark DELIVERED (production delivery semantics)
    await markDelivered();

    // Verify final state
    const afterRecovery = await prisma.displayCallEvent.findMany({
        where: { serviceId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // Count tickets — should be unchanged
    const ticketCount = await prisma.ticket.count({ where: { serviceId } });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
        pendingCount: events.length,
        delivered,
        afterRecovery: afterRecovery.map((e) => ({
            eventId: e.eventId,
            status: e.status,
            ticketId: e.ticketId,
        })),
        ticketCount,
    }));

    await prisma.$disconnect();
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
});
