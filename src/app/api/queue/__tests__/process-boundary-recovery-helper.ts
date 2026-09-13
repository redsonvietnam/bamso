// CORE-06 process-boundary recovery helper: called via child_process.fork()
// Performs the actual display recovery path (what /api/sse/display does on reconnect):
//   1. Read all PENDING DisplayCallEvents for today
//   2. "Deliver" them (simulate SSE controller.enqueue)
//   3. Mark DELIVERED
// Prints the result as JSON for the parent process to assert.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const serviceId = process.argv[2];
    if (!serviceId) {
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({ error: 'Missing serviceId argument' }));
        process.exit(1);
    }

    // This is the EXACT recovery path from /api/sse/display/route.ts:
    // findMany PENDING → emit → updateMany DELIVERED
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const pendingEvents = await prisma.displayCallEvent.findMany({
        where: {
            status: 'PENDING',
            serviceId,
            createdAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // "Deliver" each event (in production: controller.enqueue SSE payload)
    const delivered = pendingEvents.map((event) => ({
        eventId: event.eventId,
        ticketNumber: event.ticketNumber,
        pos: event.pos,
        customerName: event.customerName,
        nextTicketNumber: event.nextTicketNumber,
    }));

    // Mark DELIVERED (what SSE display endpoint does after enqueue)
    if (pendingEvents.length > 0) {
        await prisma.displayCallEvent.updateMany({
            where: { id: { in: pendingEvents.map((e) => e.id) } },
            data: { status: 'DELIVERED' },
        });
    }

    // Verify final state
    const afterRecovery = await prisma.displayCallEvent.findMany({
        where: { serviceId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // Count tickets — should be unchanged
    const ticketCount = await prisma.ticket.count({ where: { serviceId } });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
        pendingCount: pendingEvents.length,
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
