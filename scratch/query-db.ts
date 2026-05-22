import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const tickets = await prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' }
    });
    console.log('--- ALL TICKETS ---');
    console.log(JSON.stringify(tickets, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
