// CORE-06 process-boundary helper: called via child_process
// Creates a CALL-NEXT, commits the event, and prints the result as JSON.
// The parent process reads the output to prove persistence across process boundaries.

import { PrismaClient } from '@prisma/client';
import { callNextTicket } from '@/lib/queue-service';
import { createTicket } from '@/lib/ticket-service';

const prisma = new PrismaClient();

async function main() {
    const serviceCode = 'CORE6PROC';
    const pos = 'Quầy 1';

    const existingSvc = await prisma.service.findUnique({ where: { code: serviceCode }, select: { id: true } });
    if (existingSvc) {
        await prisma.auditLog.deleteMany({ where: { actorId: 'core6-proc-user' } });
        await prisma.displayCallEvent.deleteMany({ where: { serviceId: existingSvc.id } });
        await prisma.ticket.deleteMany({ where: { serviceId: existingSvc.id } });
        await prisma.service.delete({ where: { id: existingSvc.id } });
    }

    const svc = await prisma.service.create({
        data: { code: serviceCode, name: 'Process Boundary Test', color: '#000', prefix: 'P6', order: 1 },
        select: { id: true },
    });

    await createTicket({ serviceId: svc.id });
    await createTicket({ serviceId: svc.id });

    const result = await callNextTicket(svc.id, pos, { actorType: 'SYSTEM', actorId: 'core6-proc-user', actorRole: 'ADMIN' });

    if (!result.ticket) {
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({ error: 'No ticket claimed' }));
        process.exit(1);
    }

    const events = await prisma.displayCallEvent.findMany({
        where: { serviceId: svc.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
        serviceId: svc.id,
        ticketId: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        eventId: events[0]?.eventId,
        eventStatus: events[0]?.status,
        eventCount: events.length,
    }));

    await prisma.$disconnect();
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
});
